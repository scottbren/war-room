import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MapFile } from "@war-room/content";
import type { Floor, Room, Vec2, VerticalLink } from "@war-room/content";

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
 *   - every window sits on a wall, joins a room on its floor to "outside", is not in a
 *     room tagged "panic-room" or "safe-landing", and does not overlap a door
 *   - the map "charon" must contain rooms tagged "panic-room", "safe-landing",
 *     "tunnel-exit" and "security-center", so those checks cannot pass by finding
 *     nothing to check
 *   - utilities (only on maps whose markers carry "circuit:<id>" tags): every circuit is fed by a
 *     panel marker ("util:panel" + "feeds:<id>") that sits inside a room and has a power source
 *     ("supplies:<id>"); circuit "c.panic" is never supplied by the mains and its panel is inside a
 *     room tagged "panic-room"; the smart hubs are not all on one circuit; every "intel:item" lies
 *     inside a room; no "net:wifi" access point is inside the panic room (its network is air-gapped)
 *   - every vertical-link end on an indoor floor lies inside a room (ends on the open-air
 *     levels "grounds", "shore" and "hill" may be outdoors, e.g. the cliff path)
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

/** Open-air levels: a link may end on them outside any room. */
const OUTDOOR_FLOORS: ReadonlySet<string> = new Set(["grounds", "shore", "hill"]);
const isOutdoor = (floorId: string): boolean => OUTDOOR_FLOORS.has(floorId);

const contains = (r: Rect, p: Vec2): boolean => p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y;

/** On a wall line: collinear with a wall and within its extent, widened by half the door (the gap cut for it). */
function onWall(door: { at: Vec2; width: number }, floor: Floor): boolean {
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

/** The widest a secret door can be (a bookcase on a hinge, not a double door). */
const HIDDEN_DOOR_MAX_WIDTH = 1.2;

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
      if (door.hidden === true) {
        if (a === "outside" || b === "outside") {
          out.push({ check: "hidden-door-outside", message: `Door ${door.id} (floor ${floor.id}) is hidden but opens to the outside; a secret door must join two rooms` });
        }
        if (door.kind !== "standard") {
          out.push({ check: "hidden-door-kind", message: `Door ${door.id} (floor ${floor.id}) is hidden but its kind is ${door.kind}; a secret door must be a standard door` });
        }
        if (door.width > HIDDEN_DOOR_MAX_WIDTH) {
          out.push({ check: "hidden-door-width", message: `Door ${door.id} (floor ${floor.id}) is hidden but ${door.width} m wide; a secret door is at most ${HIDDEN_DOOR_MAX_WIDTH} m` });
        }
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

/** True when two rectangles touch along a run of positive length (not just at a corner). */
function sharesEdge(a: Room["rect"], b: Room["rect"]): boolean {
  const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const overlapY = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  return (overlapX > 0 && (a.max.y === b.min.y || b.max.y === a.min.y)) || (overlapY > 0 && (a.max.x === b.min.x || b.max.x === a.min.x));
}

function checkReachability(map: MapFile, out: Issue[]): void {
  const approach = map.markers.find((m) => m.kind === "approach" && m.tags.includes("approach:A"));
  if (!approach) {
    out.push({ check: "approach-a", message: 'No approach A marker found (a marker of kind "approach" tagged "approach:A")' });
    return;
  }

  const edges = new Map<string, Set<string>>();
  const plain = new Map<string, Set<string>>(); // the same graph without secret doors: what a plan can count on
  const add = (graph: Map<string, Set<string>>, from: string, to: string): void => {
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from)!.add(to);
  };
  const link = (from: string, to: string, secret = false): void => {
    add(edges, from, to);
    if (!secret) add(plain, from, to);
  };
  for (const floor of map.floors) {
    for (const d of floor.doors) {
      link(d.between[0], d.between[1], d.hidden === true);
      link(d.between[1], d.between[0], d.hidden === true);
    }
  }
  // Galleries that meet share one open walkway (derive-walls leaves no wall between them), so they connect without a door.
  for (const floor of map.floors) {
    const galleries = floor.rooms.filter((r) => r.tags.includes("gallery"));
    for (const a of galleries) {
      for (const b of galleries) {
        if (a.id !== b.id && sharesEdge(a.rect, b.rect)) link(a.id, b.id);
      }
    }
  }
  for (const l of map.verticalLinks) {
    const from = roomAt(map, l.from.floor, l.from.at);
    const to = roomAt(map, l.to.floor, l.to.at);
    link(from, to);
    if (l.bidirectional) link(to, from);
  }

  const start = approach.at ? roomAt(map, approach.floor, approach.at) : "outside";
  const reach = (graph: Map<string, Set<string>>): Set<string> => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift() as string;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const next of [...(graph.get(node) ?? [])].sort()) queue.push(next);
    }
    return seen;
  };
  const seen = reach(edges);
  const seenPlain = reach(plain);

  for (const floor of map.floors) {
    for (const room of [...floor.rooms].sort(byId)) {
      if (room.tags.includes("void")) continue;
      if (!seen.has(room.id)) {
        out.push({
          check: "unreachable-room",
          message: `Room ${room.id} (floor ${floor.id}) cannot be reached from approach A through doors and vertical links`,
        });
      } else if (!seenPlain.has(room.id)) {
        out.push({
          check: "hidden-only-room",
          message: `Room ${room.id} (floor ${floor.id}) can only be reached through hidden doors; give it an ordinary way in`,
        });
      }
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

      // Tunnel to the open grounds (or the shore), exiting at the boathouse
      const tunnels = map.verticalLinks.filter((l) => {
        const ends = [l.from, l.to];
        return ends.some((e) => e.floor === floor.id && inRoom(floor.id, e.at, panic)) && ends.some((e) => isOutdoor(e.floor));
      });
      if (tunnels.length === 0) {
        out.push({ check: "panic-tunnel", message: `Panic room ${panic.id} has no tunnel link to the grounds` });
      }
      for (const t of tunnels) {
        const far = [t.from, t.to].find((e) => isOutdoor(e.floor));
        const exit = !!far && roomsOn(far.floor).some((r) => r.tags.includes("tunnel-exit") && contains(r.rect, far.at));
        if (!exit) {
          out.push({
            check: "tunnel-exit",
            message: `Tunnel link ${t.id} does not exit at the boathouse (its outdoor end is not inside a room tagged "tunnel-exit")`,
          });
        }
      }
    }
  }
}

const REQUIRED_TAGS_BY_MAP: Record<string, readonly string[]> = {
  charon: ["panic-room", "safe-landing", "tunnel-exit", "security-center"],
};

function checkWindows(map: MapFile, out: Issue[]): void {
  for (const floor of map.floors) {
    const roomsById = new Map(floor.rooms.map((r) => [r.id, r]));
    for (const w of floor.windows) {
      const where = `Window ${w.id} (floor ${floor.id})`;
      const [a, b] = w.between;
      const sides = [a, b];
      let known = true;
      for (const side of sides) {
        if (side !== "outside" && !roomsById.has(side)) {
          out.push({ check: "window-room", message: `${where} names unknown room ${side}` });
          known = false;
        }
      }
      if (known && !(sides.includes("outside") && sides.some((x) => x !== "outside"))) {
        out.push({ check: "window-outside", message: `${where} must join a room to "outside", not ${a} to ${b}` });
      }
      for (const side of sides) {
        const room = roomsById.get(side);
        if (room && (room.tags.includes("panic-room") || room.tags.includes("safe-landing"))) {
          out.push({ check: "window-hardened-room", message: `${where} is in ${room.id}, which must stay windowless (panic rooms and safe landings)` });
        }
      }
      if (!onWall(w, floor)) out.push({ check: "window-on-wall", message: `${where} is not on any wall` });
      for (const d of floor.doors) {
        const reach = (w.width + d.width) / 2;
        const sameVerticalLine = d.at.x === w.at.x && Math.abs(d.at.y - w.at.y) < reach;
        const sameHorizontalLine = d.at.y === w.at.y && Math.abs(d.at.x - w.at.x) < reach;
        if (sameVerticalLine || sameHorizontalLine) {
          out.push({ check: "window-door-overlap", message: `${where} overlaps door ${d.id}` });
        }
      }
    }
  }
}

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
      if (isOutdoor(end.floor)) continue;
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


function checkUtilities(map: MapFile, out: Issue[]): void {
  const tag = (m: { tags: string[] }, prefix: string): string[] =>
    m.tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));
  const markers = [...map.markers].sort(byId);
  if (!markers.some((m) => tag(m, "circuit").length > 0)) return;
  const roomOfMarker = (m: { floor: string; at?: Vec2 }): string => (m.at ? roomAt(map, m.floor, m.at) : "outside");

  const panels = markers.filter((m) => m.tags.includes("util:panel"));
  const fed = new Set(panels.flatMap((p) => tag(p, "feeds")));
  for (const p of panels) {
    if (roomOfMarker(p) === "outside") {
      out.push({ check: "panel-room", message: `Panel ${p.id} (floor ${p.floor}) is not inside any room` });
    }
  }
  const used = new Set<string>();
  for (const m of markers) {
    for (const c of tag(m, "circuit")) {
      used.add(c);
      if (!fed.has(c)) {
        out.push({ check: "circuit-panel", message: `Marker ${m.id} is on circuit ${c} but no panel (a marker tagged "util:panel" and "feeds:${c}") feeds it` });
      }
    }
  }
  for (const c of [...new Set([...fed, ...used])].sort()) {
    const suppliers = markers.filter((m) => tag(m, "supplies").includes(c));
    if (suppliers.length === 0) {
      out.push({ check: "circuit-source", message: `Circuit ${c} has no power source (a marker tagged "supplies:${c}")` });
    }
    if (c === "c.panic") {
      for (const s of suppliers.filter((m) => m.tags.includes("power:mains"))) {
        out.push({ check: "panic-circuit", message: `Circuit ${c} (panic room) must not be supplied by the mains (${s.id}); it runs on batteries and generators` });
      }
    }
  }
  for (const p of panels.filter((m) => tag(m, "feeds").includes("c.panic"))) {
    const room = map.floors.flatMap((f) => (f.id === p.floor ? f.rooms : [])).find((r) => r.id === roomOfMarker(p));
    if (!room || !room.tags.includes("panic-room")) {
      out.push({ check: "panic-panel", message: `Panel ${p.id} feeds the panic circuit c.panic but is not inside a room tagged "panic-room"` });
    }
  }

  const hubs = markers.filter((m) => m.tags.includes("smart:hub"));
  const hubCircuits = new Set(hubs.flatMap((h) => tag(h, "circuit")));
  if (hubs.length > 1 && hubCircuits.size < 2) {
    out.push({ check: "hub-circuits", message: `Smart hubs ${hubs.map((h) => h.id).join(", ")} are all on one circuit; one breaker must not blind the house` });
  }

  for (const m of markers.filter((x) => x.tags.includes("intel:item"))) {
    if (roomOfMarker(m) === "outside") {
      out.push({ check: "intel-room", message: `Intel item ${m.id} (floor ${m.floor}) is not inside any room` });
    }
  }

  for (const ap of markers.filter((x) => x.tags.includes("net:wifi"))) {
    const room = map.floors.flatMap((f) => (f.id === ap.floor ? f.rooms : [])).find((r) => r.id === roomOfMarker(ap));
    if (room?.tags.includes("panic-room")) {
      out.push({ check: "panic-airgap", message: `Wifi access point ${ap.id} is inside panic room ${room.id}: that breaks the air gap its network segment is meant to have` });
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
  checkWindows(map, issues);
  checkLinkEnds(map, issues);
  checkRequiredRooms(map, issues);
  checkPanicRooms(map, issues);
  checkFamily(map, issues);
  checkUtilities(map, issues);
  checkAccess(map, issues);
  checkServices(map, issues);
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

/** Access control: readers (`auth:<method>` + `door:<id>`) must stand beside a real door; panic doors need biometrics. Opt-in. */
function checkAccess(map: MapFile, out: Issue[]): void {
  const tag = (m: { tags: string[] }, prefix: string): string[] =>
    m.tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));
  const readers = [...map.markers].filter((m) => tag(m, "auth").length > 0).sort(byId);
  if (readers.length === 0) return;
  const panicRooms = new Set(map.floors.flatMap((f) => f.rooms.filter((r) => r.tags.includes("panic-room")).map((r) => r.id)));
  const methodsByDoor = new Map<string, string[]>();
  for (const r of readers) {
    const doorId = tag(r, "door")[0];
    const floor = map.floors.find((f) => f.id === r.floor);
    const door = floor?.doors.find((d) => d.id === doorId);
    if (!doorId || !door) {
      out.push({ check: "reader-door", message: `Reader ${r.id} (floor ${r.floor}) names door ${doorId ?? "(none)"} which does not exist on that floor` });
      continue;
    }
    if (r.at && Math.hypot(r.at.x - door.at.x, r.at.y - door.at.y) > 4) {
      out.push({ check: "reader-far", message: `Reader ${r.id} is far from its door ${doorId} (more than 4 m)` });
    }
    const mechanical = ["dial", "key"].includes(tag(r, "auth")[0]!);
    if (!mechanical && tag(r, "circuit").length === 0) {
      out.push({ check: "reader-circuit", message: `Networked reader ${r.id} has no circuit; it cannot run without power` });
    }
    if (!mechanical && !["open", "secure"].includes(tag(r, "fail")[0] ?? "")) {
      out.push({ check: "reader-fail", message: `Reader ${r.id} needs a fail mode (fail:open or fail:secure) for when power is cut` });
    }
    methodsByDoor.set(doorId, [...(methodsByDoor.get(doorId) ?? []), tag(r, "auth")[0]!]);
  }
  for (const doorId of [...methodsByDoor.keys()].sort()) {
    const door = map.floors.flatMap((f) => f.doors).find((d) => d.id === doorId);
    if (door?.between.some((b) => panicRooms.has(b)) && !methodsByDoor.get(doorId)!.includes("biometric")) {
      out.push({ check: "panic-door-biometric", message: `Door ${doorId} leads into the panic room but has no biometric reader` });
    }
  }
  const panicDoors = new Set(map.floors.flatMap((f) => f.doors.filter((d) => d.between.some((b) => panicRooms.has(b))).map((d) => d.id)));
  for (const r of readers) {
    if (panicDoors.has(tag(r, "door")[0] ?? "") && tag(r, "fail")[0] === "open") {
      out.push({ check: "panic-door-fail", message: `Reader ${r.id} guards the panic room but fails open; panic room doors must fail secure` });
    }
  }
  for (const b of [...map.markers].filter((m) => m.tags.includes("item:badge")).sort(byId)) {
    if (!b.at || roomAt(map, b.floor, b.at) === "outside") {
      out.push({ check: "badge-room", message: `Badge ${b.id} (floor ${b.floor}) is not inside any room` });
    }
  }
}

/** Building services, camera coverage and phones. Opt-in: only runs when a marker uses svc:, sees: or comms:phone. */
function checkServices(map: MapFile, out: Issue[]): void {
  const tag = (m: { tags: string[] }, prefix: string): string[] =>
    m.tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));
  const markers = [...map.markers].sort(byId);
  const roomIds = new Set(map.floors.flatMap((f) => f.rooms.map((r) => r.id)));
  const outdoorOk = new Set(["svc:water-main", "svc:gas-main", "svc:vent-intake"]);
  const roomOf = (m: { floor: string; at?: Vec2 }): string => (m.at ? roomAt(map, m.floor, m.at) : "outside");
  const panicRooms = new Set(map.floors.flatMap((f) => f.rooms.filter((r) => r.tags.includes("panic-room")).map((r) => r.id)));

  for (const m of markers) {
    const svc = m.tags.find((t) => t.startsWith("svc:"));
    if (svc && !outdoorOk.has(svc) && roomOf(m) === "outside") {
      out.push({ check: "service-room", message: `Service marker ${m.id} (${svc}, floor ${m.floor}) is not inside any room` });
    }
    if (m.tags.includes("svc:vent-grate") && panicRooms.has(roomOf(m))) {
      out.push({ check: "panic-vent", message: `Vent grate ${m.id} is inside panic room ${roomOf(m)}: the panic room must have its own filtered air` });
    }
    if (m.tags.includes("svc:elevator")) {
      const link = tag(m, "link")[0];
      if (!link || !map.verticalLinks.some((v) => v.id === link)) {
        out.push({ check: "lift-link", message: `Lift ${m.id} names link ${link ?? "(none)"} which does not exist` });
      }
    }
    for (const r of tag(m, "sees")) {
      if (!roomIds.has(r)) out.push({ check: "camera-room", message: `Camera ${m.id} sees room ${r} which does not exist` });
    }
  }
  const seen = new Map<string, string>();
  for (const p of markers.filter((m) => m.tags.includes("comms:phone"))) {
    const ext = tag(p, "ext")[0];
    if (!ext) {
      out.push({ check: "phone-ext", message: `Phone ${p.id} has no extension (ext:<n>)` });
    } else if (seen.has(ext)) {
      out.push({ check: "phone-ext", message: `Phones ${seen.get(ext)} and ${p.id} share extension ${ext}` });
    } else {
      seen.set(ext, p.id);
    }
  }
}
