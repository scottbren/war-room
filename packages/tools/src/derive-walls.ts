import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MapFile } from "@war-room/content";
import type { Floor, Room, Wall } from "@war-room/content";

/**
 * Derives wall segments from room rectangles.
 *
 * For each floor: every room edge is split wherever another room's edge starts
 * or stops on the same line. A run shared by two rooms becomes ONE interior
 * wall; a run owned by one room becomes an exterior wall. Gaps are then cut
 * for doors. Windows do NOT cut gaps: a window sits in solid wall and only a door
 * opens it. Walls whose id starts with "w.fixed." are hand-authored (e.g. the
 * estate perimeter) and are kept untouched. The roof gets walls only around rooms
 * tagged "structure" (bastions, the radar tower, covered walkways); the open decks
 * have none, their parapet is cover.
 *
 * Material rules, first match wins (tags come from the room's `tags`):
 *   roof "structure" with "bastion" or "radar-tower" -> reinforced, 0.5 m, indestructible
 *   roof "structure" otherwise (a covered walkway)   -> stone, 0.3 m
 *   "arcade" room shared with an "exterior" room -> no wall (an open colonnade)
 *   panic-room / safe-landing on either side  -> reinforced, 0.5 m, indestructible
 *   lone edge of a "void" room                -> glass railing, 1.1 m
 *   void shared with a "hall" (walkway) room  -> glass railing, 1.1 m
 *   lone edge of an "exterior" room (balcony, courtyard) -> glass railing, 1.1 m
 *   shared edge with an "exterior" room       -> reinforced, 0.4 m (house exterior)
 *   shared edge, both "interior"              -> plaster, 0.2 m
 *   shared edge otherwise (outbuildings)      -> stone, 0.3 m
 *   lone "interior" edge on the house outline -> reinforced, 0.4 m
 *   lone "interior" edge elsewhere            -> plaster, 0.2 m (a gap between rooms)
 *   lone "vessel" edge                        -> reinforced, 0.3 m
 *   anything else (outbuildings, villas)      -> stone, 0.3 m
 */

const FIXED_PREFIX = "w.fixed.";
const RAILING_HEIGHT = 1.1;

/** "x": vertical wall at x = line running along y. "y": horizontal wall at y = line running along x. */
type Axis = "x" | "y";

interface Run {
  axis: Axis;
  line: number;
  from: number;
  to: number;
  owners: Room[];
}

interface Rect4 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function overlapCheck(floor: Floor): void {
  const rooms = floor.rooms;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = (rooms[i] as Room).rect;
      const b = (rooms[j] as Room).rect;
      if (a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y) {
        throw new Error(`Rooms ${(rooms[i] as Room).id} and ${(rooms[j] as Room).id} overlap on floor ${floor.id}`);
      }
    }
  }
}

function collectRuns(floor: Floor): Run[] {
  type Edge = { axis: Axis; line: number; from: number; to: number; room: Room };
  const edges: Edge[] = [];
  for (const room of floor.rooms) {
    const { min, max } = room.rect;
    edges.push({ axis: "x", line: min.x, from: min.y, to: max.y, room });
    edges.push({ axis: "x", line: max.x, from: min.y, to: max.y, room });
    edges.push({ axis: "y", line: min.y, from: min.x, to: max.x, room });
    edges.push({ axis: "y", line: max.y, from: min.x, to: max.x, room });
  }

  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = `${e.axis}:${e.line}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const runs: Run[] = [];
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key) as Edge[];
    const points = [...new Set(group.flatMap((e) => [e.from, e.to]))].sort((p, q) => p - q);
    let current: Run | undefined;
    for (let i = 0; i + 1 < points.length; i++) {
      const p = points[i] as number;
      const q = points[i + 1] as number;
      const owners = group
        .filter((e) => e.from <= p && e.to >= q)
        .map((e) => e.room)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (owners.length === 0) {
        current = undefined;
        continue;
      }
      const ownerKey = owners.map((o) => o.id).join("|");
      if (current && current.to === p && current.owners.map((o) => o.id).join("|") === ownerKey) {
        current.to = q;
      } else {
        current = { axis: (group[0] as Edge).axis, line: (group[0] as Edge).line, from: p, to: q, owners };
        runs.push(current);
      }
    }
  }
  return runs;
}

function houseOutline(floor: Floor): Rect4 | undefined {
  const house = floor.rooms.filter((r) => r.tags.includes("interior"));
  if (house.length === 0) return undefined;
  return {
    minX: Math.min(...house.map((r) => r.rect.min.x)),
    minY: Math.min(...house.map((r) => r.rect.min.y)),
    maxX: Math.max(...house.map((r) => r.rect.max.x)),
    maxY: Math.max(...house.map((r) => r.rect.max.y)),
  };
}

type Spec = Pick<Wall, "material" | "thickness" | "destructible"> & { height?: number };

/** Wall spec for a run, or undefined when the run should have no wall at all. */
function classify(run: Run, outline: Rect4 | undefined): Spec | undefined {
  const { owners } = run;
  const has = (tag: string) => owners.some((o) => o.tags.includes(tag));
  const shared = owners.length >= 2;

  if (has("structure")) {
    // Walls stand as tall as the structure, not as the open deck beside it.
    const height = Math.max(...owners.filter((o) => o.tags.includes("structure")).map((o) => o.ceiling));
    return has("bastion") || has("radar-tower")
      ? { material: "reinforced", thickness: 0.5, destructible: false, height }
      : { material: "stone", thickness: 0.3, destructible: true, height };
  }
  if (shared && has("arcade") && has("exterior")) return undefined;

  if (has("panic-room") || has("safe-landing")) return { material: "reinforced", thickness: 0.5, destructible: false };
  if (!shared && has("void")) return { material: "glass", thickness: 0.1, destructible: true, height: RAILING_HEIGHT };
  if (shared && has("void") && has("hall")) return { material: "glass", thickness: 0.1, destructible: true, height: RAILING_HEIGHT };
  if (!shared && has("exterior")) return { material: "glass", thickness: 0.1, destructible: true, height: RAILING_HEIGHT };
  if (shared && has("exterior")) return { material: "reinforced", thickness: 0.4, destructible: true };
  if (shared) {
    return owners.every((o) => o.tags.includes("interior"))
      ? { material: "plaster", thickness: 0.2, destructible: true }
      : { material: "stone", thickness: 0.3, destructible: true };
  }
  if (has("interior")) {
    const onOutline =
      outline !== undefined &&
      (run.axis === "x" ? run.line === outline.minX || run.line === outline.maxX : run.line === outline.minY || run.line === outline.maxY);
    return onOutline
      ? { material: "reinforced", thickness: 0.4, destructible: true }
      : { material: "plaster", thickness: 0.2, destructible: true };
  }
  if (has("vessel")) return { material: "reinforced", thickness: 0.3, destructible: true };
  return { material: "stone", thickness: 0.3, destructible: true };
}

interface Gap {
  id: string;
  kind: "door" | "window";
  axis: Axis;
  line: number;
  lo: number;
  hi: number;
}

function gapOf(item: { id: string; at: { x: number; y: number }; width: number }, kind: Gap["kind"], run: Run): Gap | undefined {
  const across = run.axis === "x" ? item.at.x : item.at.y;
  const along = run.axis === "x" ? item.at.y : item.at.x;
  const lo = along - item.width / 2;
  const hi = along + item.width / 2;
  if (across !== run.line || lo < run.from || hi > run.to) return undefined;
  return { id: item.id, kind, axis: run.axis, line: run.line, lo, hi };
}

function deriveFloor(floor: Floor): Floor {
  const fixed = floor.walls.filter((w) => w.id.startsWith(FIXED_PREFIX));
  const isRoof = floor.id === "roof";
  overlapCheck(floor);
  let runs = collectRuns(floor);
  // On the roof only structures are walled; the open decks have a parapet of cover instead.
  if (isRoof) runs = runs.filter((run) => run.owners.some((o) => o.tags.includes("structure")));
  const outline = houseOutline(floor);

  const cuts = new Map<Run, Gap[]>();
  const openings = floor.doors.map((d) => ({ item: d, kind: "door" as const }));
  for (const { item, kind } of openings) {
    let placed = false;
    for (const run of runs) {
      const gap = gapOf(item, kind, run);
      if (!gap) continue;
      cuts.set(run, [...(cuts.get(run) ?? []), gap]);
      placed = true;
      break;
    }
    // A roof door between two open decks has no wall to cut: it just marks the connection.
    if (!placed && !isRoof && !fixed.some((w) => fixedWallHasGap(w, item))) {
      throw new Error(`${kind === "door" ? "Door" : "Window"} ${item.id} on floor ${floor.id} is not on any wall`);
    }
  }

  const derived: Wall[] = [];
  for (const run of runs) {
    const spec = classify(run, outline);
    if (!spec) continue;
    // A wall shared by a tall room and a lower one stops at the lower ceiling: above it is the next floor's space (a
    // gallery looking into a double-height hall), not wall. Exterior rooms (courtyards, balconies) do not lower it.
    const sides = run.owners.filter((o) => !o.tags.includes("exterior"));
    const height = spec.height ?? Math.min(...(sides.length > 0 ? sides : run.owners).map((o) => o.ceiling));
    let pieces: [number, number][] = [[run.from, run.to]];
    for (const gap of (cuts.get(run) ?? []).sort((a, b) => a.lo - b.lo)) {
      pieces = pieces.flatMap(([from, to]): [number, number][] => {
        if (gap.hi <= from || gap.lo >= to) return [[from, to]];
        const out: [number, number][] = [];
        if (gap.lo > from) out.push([from, gap.lo]);
        if (gap.hi < to) out.push([gap.hi, to]);
        return out;
      });
    }
    for (const [from, to] of pieces) {
      derived.push({
        id: `w.${floor.id}.${run.axis}${run.line}:${from}-${to}`,
        a: run.axis === "x" ? { x: run.line, y: from } : { x: from, y: run.line },
        b: run.axis === "x" ? { x: run.line, y: to } : { x: to, y: run.line },
        thickness: spec.thickness,
        height,
        material: spec.material,
        destructible: spec.destructible,
      });
    }
  }
  return { ...floor, walls: [...fixed, ...derived].sort(byId) };
}

/** A door/window may sit in a gap that was left by hand between two fixed wall segments (e.g. the estate gate). */
function fixedWallHasGap(wall: Wall, item: { at: { x: number; y: number }; width: number }): boolean {
  const vertical = wall.a.x === wall.b.x;
  const line = vertical ? wall.a.x : wall.a.y;
  const across = vertical ? item.at.x : item.at.y;
  const along = vertical ? item.at.y : item.at.x;
  const lo = Math.min(vertical ? wall.a.y : wall.a.x, vertical ? wall.b.y : wall.b.x) - item.width / 2;
  const hi = Math.max(vertical ? wall.a.y : wall.a.x, vertical ? wall.b.y : wall.b.x) + item.width / 2;
  return across === line && along >= lo && along <= hi;
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Returns a copy of the map with every floor's derived walls regenerated. */
export function deriveWalls(map: MapFile): MapFile {
  return { ...structuredClone(map), floors: map.floors.map((f) => deriveFloor(structuredClone(f))) };
}

function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (typeof v === "object" && v !== null) {
    const parts = Object.entries(v).map(([k, val]) => `${JSON.stringify(k)}: ${inline(val)}`);
    return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
  }
  return JSON.stringify(v);
}

function pretty(v: unknown, indent: string): string {
  const flat = inline(v);
  if (flat.length + indent.length <= 120 || typeof v !== "object" || v === null) return flat;
  const next = `${indent}  `;
  if (Array.isArray(v)) {
    return `[\n${v.map((item) => `${next}${pretty(item, next)}`).join(",\n")}\n${indent}]`;
  }
  const lines = Object.entries(v).map(([k, val]) => `${next}${JSON.stringify(k)}: ${pretty(val, next)}`);
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

/** Stable, diff-friendly JSON: small objects stay on one line, large ones expand. */
export function formatMap(map: MapFile): string {
  return `${pretty(map, "")}\n`;
}

function main(): void {
  const name = process.argv.slice(2).find((a) => a !== "--") ?? "charon";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new Error(`Invalid map name "${name}"`);
  const file = fileURLToPath(new URL(`../../content/maps/${name}.json`, import.meta.url));
  const before = MapFile.parse(JSON.parse(readFileSync(file, "utf8")));
  const after = deriveWalls(before);
  const text = formatMap(after);
  writeFileSync(file, text);
  const counts = after.floors.map((f) => `${f.id}: ${f.walls.length}`).join(", ");
  console.log(`Wrote ${name}.json (walls per floor — ${counts})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
