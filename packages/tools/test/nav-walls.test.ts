import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav } from "../../sim/src/nav";
import type { Nav } from "../../sim/src/nav";
import { createSim } from "../../sim/src";
import type { Pos } from "../../sim/src";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const baseMap = MapFile.parse(JSON.parse(read("../../content/maps/charon.json").toString("utf8")));
const map: MapFile = {
  ...baseMap,
  markers: [...baseMap.markers, { id: "m.spawn.op.test", floor: "grounds", kind: "spawn", at: { x: 48, y: 68 }, tags: ["entity:op.alpha.1", "side:operator"] }],
};

let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(read("../../content/generated/charon.navmesh.bin")), map });
});

interface Rect { id: string; floor: string; height: number; x0: number; y0: number; x1: number; y1: number }
/** Every wall as the rectangle it occupies (axis-aligned walls only; the map has no diagonals). */
function wallRects(): Rect[] {
  const out: Rect[] = [];
  for (const f of map.floors) {
    for (const w of f.walls) {
      const t = w.thickness / 2;
      out.push({
        id: w.id, floor: f.id, height: w.height,
        x0: Math.min(w.a.x, w.b.x) - (w.a.x === w.b.x ? t : 0), x1: Math.max(w.a.x, w.b.x) + (w.a.x === w.b.x ? t : 0),
        y0: Math.min(w.a.y, w.b.y) - (w.a.y === w.b.y ? t : 0), y1: Math.max(w.a.y, w.b.y) + (w.a.y === w.b.y ? t : 0),
      });
    }
  }
  return out;
}
const sameLevel = (a: string, b: string): boolean => a === b || (a === "grounds" && b === "ground") || (a === "ground" && b === "grounds") || (a === "hill" && b === "upper") || (a === "upper" && b === "hill");

const floorElevation = (id: string): number => map.floors.find((f) => f.id === id)!.elevation;

const room = (floor: string, id: string): Pos => {
  const r = map.floors.find((f) => f.id === floor)!.rooms.find((x) => x.id === id)!.rect;
  const p = { floor, x: (r.min.x + r.max.x) / 2, y: (r.min.y + r.max.y) / 2 } as Pos;
  for (let d = 0; d < 6; d += 0.25) {
    for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]] as const) {
      const q = { ...p, x: p.x + dx, y: p.y + dy } as Pos;
      if (nav.isWalkable(q)) return q;
    }
  }
  throw new Error(`no walkable point in ${id}`);
};

/** Walks the operator and returns every position, plus the midpoint between consecutive ticks (what the client draws). */
function trace(to: Pos): { floor: string; x: number; y: number; tick: number }[] {
  const sim = createSim({ seed: 7, map, nav });
  sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to });
  const pts: { floor: string; x: number; y: number; tick: number }[] = [];
  let prev: { floor: string; x: number; y: number } | undefined;
  for (let i = 0; i < 1500; i++) {
    const s = sim.step();
    const u = s.snapshot.entities.find((x) => x.id === "op.alpha.1");
    if (!u) break;
    const p = { floor: u.pos.floor as string, x: u.pos.x, y: u.pos.y };
    if (prev && prev.floor === p.floor) {
      for (let k = 1; k < 20; k++) pts.push({ floor: p.floor, x: prev.x + ((p.x - prev.x) * k) / 20, y: prev.y + ((p.y - prev.y) * k) / 20, tick: i });
    }
    pts.push({ ...p, tick: i });
    prev = p;
    if (p.x === to.x && p.y === to.y && p.floor === to.floor) break;
  }
  return pts;
}

describe("walking never enters a wall", () => {
  const targets: [string, string][] = [["ground", "g.panic"], ["ground", "g.study"], ["ground", "g.kitchen"], ["upper", "u.son"], ["ground", "g.dining"]];
  for (const [floor, id] of targets) {
    it(`helipad to ${id}: no sampled position is inside a wall rectangle`, () => {
      const walls = wallRects();
      const pts = trace(room(floor, id));
      expect(pts.length).toBeGreaterThan(50);
      // A stair flight is walked as a horizontal line on its lower floor and the renderer lifts the capsule along it (see
      // client/src/stairs.ts). Where a flight meets a wall the capsule may overlap the wall's footprint only once it has
      // climbed above the wall top (the grand stair arrives at 4 m, past the 4 m hall wall), so the test uses that height.
      const lift = (p: { floor: string; x: number; y: number }): number => {
        for (const l of map.verticalLinks) {
          if (l.kind !== "stairs" || Math.abs(l.from.at.x - l.to.at.x) > 1e-9 || Math.abs(p.x - l.from.at.x) > 0.3) continue;
          const [lo, hi] = floorElevation(l.from.floor) <= floorElevation(l.to.floor) ? [l.from, l.to] : [l.to, l.from];
          const t = (p.y - lo.at.y) / (hi.at.y - lo.at.y);
          if (t < 0 || t > 1) continue;
          const rise = floorElevation(hi.floor) - floorElevation(lo.floor);
          if (p.floor === lo.floor) return rise * t;
          if (p.floor === hi.floor) return -rise * (1 - t);
        }
        return 0;
      };
      const inside = (p: { floor: string; x: number; y: number }) =>
        walls.filter((w) => sameLevel(w.floor, p.floor) && p.x > w.x0 && p.x < w.x1 && p.y > w.y0 && p.y < w.y1 && lift(p) < w.height - 0.15);
      const bad = pts.filter((p) => inside(p).length > 0);
      const detail = bad.slice(0, 5).map((p) => `${p.floor} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) tick ${p.tick} in ${inside(p).map((w) => w.id).join(",")}`);
      expect(detail, `${bad.length} of ${pts.length} samples inside walls`).toEqual([]);
    });
  }
});

describe("routes keep out of the stair body", () => {
  it("a route to the upper floor walks around the grand stair and meets it at the foot, never through the steps", () => {
    const from: Pos = { floor: "grounds", x: 48, y: 68 };
    const path = nav.findPath(from, room("upper", "u.son"));
    expect(path.length).toBeGreaterThan(2);
    const link = map.verticalLinks.find((l) => l.id === "link.grand-stairs.west")!;
    // the low part of the floating flight (under 2.1 m of headroom) is solid for routing; the high part is open underneath
    const body = { x0: link.from.at.x - 1.2, x1: link.from.at.x + 1.2, y0: link.from.at.y - 3.6, y1: link.from.at.y - 2 };
    let samples = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      if (a.floor !== "ground" || b.floor !== "ground") continue; // the flight itself is the link, not a mesh walk
      for (let k = 0; k <= 20; k++) {
        const x = a.x + ((b.x - a.x) * k) / 20, y = a.y + ((b.y - a.y) * k) / 20;
        samples++;
        expect(x > body.x0 && x < body.x1 && y > body.y0 && y < body.y1, `(${x.toFixed(2)}, ${y.toFixed(2)}) is inside the stair body`).toBe(false);
      }
    }
    expect(samples).toBeGreaterThan(20);
    expect(path.some((p) => p.floor === "ground" && Math.abs(p.x - link.from.at.x) < 0.1 && Math.abs(p.y - link.from.at.y) < 0.5)).toBe(true); // it does go to the foot (the mesh snaps it clear of the wall)
  });
});
