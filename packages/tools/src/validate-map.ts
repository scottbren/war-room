import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MapFile } from "@war-room/content";
import type { Door, Floor, Room, Vec2, VerticalLink } from "@war-room/content";

/**
 * Map validator. Every message names the exact id at fault.
 *
 * Checks (in order): cover facing on the raw data, then the schema, then
 *   - no two rooms on a floor overlap (touching edges are fine)
 *   - every door joins two different rooms (or a room and "outside") and sits
 *     on a wall; a "gate" may join outside to outside; doors on the roof need no
 *     wall because the roof has only a parapet of cover
 *   - every room is reachable from approach A through doors and vertical links,
 *     counting locked doors and restricted links as passable (breachable);
 *     rooms tagged "void" are not walkable and are exempt
 *   - each room tagged "panic-room" has a door to a room tagged "hall",
 *     a shaft up to a room tagged "safe-landing" on the upper floor, and a tunnel
 *     whose far end is inside a room tagged "tunnel-exit"
 *   - rooms tagged "family" are on the upper floor
 *   - the map "charon" must contain rooms tagged "panic-room", "safe-landing" and
 *     "tunnel-exit", so the panic-room checks cannot pass by finding nothing to check
 *   - every vertical-link end on a floor other than "grounds" lies inside a room
 *     (ends on the open grounds may be outdoors, e.g. the cliff path)
 */

export interface Issue {
  /** Short name of the check that failed, e.g. "rooms-overlap". */
  check: string;
  message: string;
}

type Rect = { min: Vec2; max: Vec2 };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------- raw-data and schema checks ----------

/** Cover facing must be set (an angle or "all"). Checked on raw data so the message names the cover. */
function coverFacingIssues(raw: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isRecord(raw) || !Array.isArray(raw["floors"])) return issues;
  for (const floor of raw["floors"] as unknown[]) {
    if (!isRecord(floor) || !Array.isArray(floor["cover"])) continue;
    for (const cover of floor["cover"] as unknown[]) {
      if (isRecord(cover) && cover["facing"] === undefined) {
        issues.push({
          check: "cover-facing",
          message: `Cover ${String(cover["id"])} (floor ${String(floor["id"])}) has no facing: use an angle 0-359 or "all"`,
        });
      }
    }
  }
  return issues;
}

/** Turns a zod path like floors.1.rooms.0.ceiling into floors[ground].rooms[g.hall].ceiling. */
function pathLabel(raw: unknown, path: readonly PropertyKey[]): string {
  let current: unknown = raw;
  let label = "";
  for (const segment of path) {
    const next: unknown = isRecord(current) || Array.isArray(current) ? (current as Record<PropertyKey, unknown>)[segment] : undefined;
    if (typeof segment === "number") {
      const id = isRecord(next) && typeof next["id"] === "string" ? next["id"] : String(segment);
      label += `[${id}]`;
    } else {
      label += label === "" ? String(segment) : `.${String(segment)}`;
    }
    current = next;
  }
  return label === "" ? "(map)" : label;
}

// ---------- geometry helpers ----------

const contains = (r: Rect, p: Vec2): boolean => p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y;

/** On a wall line: collinear with a wall and within its extent, widened by half the door (the gap cut for it). */
function onWall(door: Door, floor: Floor): boolean {
  const half = door.width / 2;
  return floor.walls.some((w) => {
    const vertical = w.a.x === w.b.x;
    const line = vertical ? w.a.x : w.a.y;
    const along = vertical ? door.at.y : door.at.x;
    const across = vertical ? door.at.x : door.at.y;
    const lo = Math.min(vertical ? w.a.y : w.a.x, vertical ? w.b.y : w.b.x) - half;
    const hi = Math.max(vertical ? w.a.y : w.a.x, vertical ? w.b.y : w.b.x) + half;
    return across === line && along >= lo && along <= hi;
  });
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ---------- semantic checks ----------

function checkOverlaps(map: MapFile, out: Issue[]): void {
  for (const floor of map.floors) {
    const rooms = [...floor.rooms].sort(byId);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i] as Room;
        const b = rooms[j] as Room;
        if (overlaps(a.rect, b.rect)) {
          out.push({ check: "rooms-overlap", message: `Rooms ${a.id} and ${b.id} overlap on floor ${floor.id}` });
        }
      }
    }
  }
}

function checkDoors(map: MapFile, out: Issue[]): void {
  for (const floor of map.floors) {
    const roomIds = new Set(floor.rooms.map((r) => r.id));
    for (const door of floor.doors) {
      const [a, b] = door.between;
      for (const side of [a, b]) {
        if (side !== "outside" && !roomIds.has(side)) {
          out.push({ check: "door-room", message: `Door ${door.id} (floor ${floor.id}) names unknown room ${side}` });
        }
      }
      const gateOutside = door.kind === "gate" && a === "outside" && b === "outside";
      if (a === b && !gateOutside) {
        out.push({ check: "door-joins-itself", message: `Door ${door.id} (floor ${floor.id}) joins ${a} to itself` });
      }
      if (floor.id !== "roof" && !onWall(door, floor)) {
        out.push({ check: "door-on-wall", message: `Door ${door.id} (floor ${floor.id}) is not on any wall` });
      }
    }
  }
}

/** Room (by id) containing a point on a floor, or "outside". */
function roomAt(map: MapFile, floorId: string, p: Vec2): string {
  const floor = map.floors.find((f) => f.id === floorId);
  const hit = [...(floor?.rooms ?? [])].sort(byId).find((r) => contains(r.rect, p));
  return hit ? hit.id : "outside";
}

function checkReachability(map: MapFile, out: Issue[]): void {
  const approach = map.markers.find((m) => m.kind === "approach" && m.tags.includes("approach:A"));
  if (!approach) {
    out.push({ check: "approach-a", message: 'No approach A marker found (a marker of kind "approach" tagged "approach:A")' });
    return;
  }

  const edges = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from)!.add(to);
  };
  for (const floor of map.floors) {
    for (const d of floor.doors) {
      link(d.between[0], d.between[1]);
      link(d.between[1], d.between[0]);
    }
  }
  for (const l of map.verticalLinks) {
    const from = roomAt(map, l.from.floor, l.from.at);
    const to = roomAt(map, l.to.floor, l.to.at);
    link(from, to);
    if (l.bidirectional) link(to, from);
  }

  const seen = new Set<string>();
  const queue = [approach.at ? roomAt(map, approach.floor, approach.at) : "outside"];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) queue.push(next);
  }

  for (const floor of map.floors) {
    for (const room of [...floor.rooms].sort(byId)) {
      if (room.tags.includes("void") || seen.has(room.id)) continue;
      out.push({
        check: "unreachable-room",
        message: `Room ${room.id} (floor ${floor.id}) cannot be reached from approach A through doors and vertical links`,
      });
    }
  }
}

function checkPanicRooms(map: MapFile, out: Issue[]): void {
  const roomsOn = (floorId: string): Room[] => map.floors.find((f) => f.id === floorId)?.rooms ?? [];
  const inRoom = (floorId: string, p: Vec2, room: Room): boolean => roomsOn(floorId).includes(room) && contains(room.rect, p);

  for (const floor of map.floors) {
    for (const panic of floor.rooms.filter((r) => r.tags.includes("panic-room"))) {
      // Door to the hall
      const hallIds = new Set(floor.rooms.filter((r) => r.tags.includes("hall")).map((r) => r.id));
      const hallDoor = floor.doors.some((d) => d.between.includes(panic.id) && d.between.some((s) => s !== panic.id && hallIds.has(s)));
      if (!hallDoor) {
        out.push({ check: "panic-hall-door", message: `Panic room ${panic.id} has no door to the hall (a room tagged "hall")` });
      }

      // Shaft up to a safe landing on the upper floor
      const upper = roomsOn("upper");
      const shaft = map.verticalLinks.some((l: VerticalLink) => {
        if (l.kind !== "shaft") return false;
        const ends = [l.from, l.to];
        const down = ends.find((e) => e.floor === floor.id && inRoom(floor.id, e.at, panic));
        const up = ends.find((e) => e.floor === "upper");
        return !!down && !!up && upper.some((r) => r.tags.includes("safe-landing") && contains(r.rect, up.at));
      });
      if (!shaft) {
        out.push({ check: "panic-shaft", message: `Panic room ${panic.id} has no shaft up to a safe landing on the upper floor` });
      }

      // Tunnel to the grounds, exiting at the boathouse
      const tunnels = map.verticalLinks.filter((l) => {
        const ends = [l.from, l.to];
        return ends.some((e) => e.floor === floor.id && inRoom(floor.id, e.at, panic)) && ends.some((e) => e.floor === "grounds");
      });
      if (tunnels.length === 0) {
        out.push({ check: "panic-tunnel", message: `Panic room ${panic.id} has no tunnel link to the grounds` });
      }
      for (const t of tunnels) {
        const far = [t.from, t.to].find((e) => e.floor === "grounds");
        const exit = roomsOn("grounds").some((r) => r.tags.includes("tunnel-exit") && far && contains(r.rect, far.at));
        if (!exit) {
          out.push({
            check: "tunnel-exit",
            message: `Tunnel link ${t.id} does not exit at the boathouse (its grounds end is not inside a room tagged "tunnel-exit")`,
          });
        }
      }
    }
  }
}

const REQUIRED_TAGS_BY_MAP: Record<string, readonly string[]> = {
  charon: ["panic-room", "safe-landing", "tunnel-exit"],
};

function checkRequiredRooms(map: MapFile, out: Issue[]): void {
  for (const tag of REQUIRED_TAGS_BY_MAP[map.id] ?? []) {
    if (!map.floors.some((f) => f.rooms.some((r) => r.tags.includes(tag)))) {
      out.push({ check: "required-room", message: `Map ${map.id} must have a room tagged "${tag}" but none was found` });
    }
  }
}

function checkLinkEnds(map: MapFile, out: Issue[]): void {
  for (const link of map.verticalLinks) {
    for (const [label, end] of [["from", link.from], ["to", link.to]] as const) {
      if (end.floor === "grounds") continue;
      if (roomAt(map, end.floor, end.at) === "outside") {
        out.push({
          check: "link-end",
          message: `Vertical link ${link.id} (${label} end, floor ${end.floor} at ${end.at.x},${end.at.y}) is not inside any room`,
        });
      }
    }
  }
}

function checkFamily(map: MapFile, out: Issue[]): void {
  for (const floor of map.floors) {
    if (floor.id === "upper") continue;
    for (const room of floor.rooms.filter((r) => r.tags.includes("family"))) {
      out.push({
        check: "family-floor",
        message: `Room ${room.id} is tagged "family" but is on floor ${floor.id}; family rooms must be on the upper floor`,
      });
    }
  }
}

/** Validates raw or parsed map data and returns every problem found (empty means valid). */
export function validateMap(input: unknown): Issue[] {
  const early = coverFacingIssues(input);
  const parsed = MapFile.safeParse(input);
  if (!parsed.success) {
    const schemaIssues = parsed.error.issues
      .filter((i) => !(early.length > 0 && i.path[i.path.length - 1] === "facing"))
      .map((i): Issue => ({ check: "schema", message: `Schema: ${pathLabel(input, i.path)}: ${i.message}` }));
    return [...early, ...schemaIssues];
  }

  const map = parsed.data;
  const issues: Issue[] = [];
  checkOverlaps(map, issues);
  checkDoors(map, issues);
  checkReachability(map, issues);
  checkLinkEnds(map, issues);
  checkRequiredRooms(map, issues);
  checkPanicRooms(map, issues);
  checkFamily(map, issues);
  return issues;
}

export function formatIssues(name: string, issues: readonly Issue[]): string {
  if (issues.length === 0) return `OK ${name}: no problems found`;
  const lines = issues.map((i) => `  [${i.check}] ${i.message}`);
  return `FAIL ${name}: ${issues.length} problem${issues.length === 1 ? "" : "s"}\n${lines.join("\n")}`;
}

function main(): void {
  const name = process.argv.slice(2).find((a) => a !== "--") ?? "charon";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new Error(`Invalid map name "${name}"`);
  const file = fileURLToPath(new URL(`../../content/maps/${name}.json`, import.meta.url));
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Cannot read packages/content/maps/${name}.json`);
  }
  const issues = validateMap(raw);
  console.log(formatIssues(name, issues));
  if (issues.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
