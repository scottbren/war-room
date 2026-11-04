import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Room } from "@war-room/content";
import { createNav } from "../../sim/src/nav";
import type { Nav } from "../../sim/src/nav";
import type { FloorId, Pos } from "../../sim/src/types";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const map = MapFile.parse(JSON.parse(read("../../content/maps/charon.json").toString("utf8")));
const room = (floor: FloorId, id: string): Room => map.floors.find((f) => f.id === floor)!.rooms.find((r) => r.id === id)!;
/** The walkable point nearest a room centre (the centre itself may be under a table or in a pool). Needs `nav`. */
const centre = (floor: FloorId, id: string): Pos => {
  const r = room(floor, id).rect;
  const cx = (r.min.x + r.max.x) / 2, cy = (r.min.y + r.max.y) / 2;
  const pts: { x: number; y: number; d: number }[] = [];
  for (let x = r.min.x + 0.5; x <= r.max.x - 0.5; x += 0.5) for (let y = r.min.y + 0.5; y <= r.max.y - 0.5; y += 0.5) pts.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  pts.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
  const hit = pts.map((p) => ({ floor, x: p.x, y: p.y })).find((p) => nav.isWalkable(p));
  if (!hit) throw new Error(`no walkable point in ${id}`);
  return hit;
};
const dist = (a: Pos, b: Pos): number => Math.hypot(a.x - b.x, a.y - b.y);
const length = (path: Pos[]): number => path.slice(1).reduce((s, p, i) => s + dist(p, path[i]!), 0);

let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(read("../../content/generated/charon.navmesh.bin")), map });
});

describe("nav: findPath on the CHARON navmesh", () => {
  it("(a) foyer to study on the ground floor, ending in the study", () => {
    const path = nav.findPath(centre("ground", "g.foyer"), centre("ground", "g.study"));
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(dist(path.at(-1)!, centre("ground", "g.study"))).toBeLessThan(0.5);
    expect(path.every((p) => p.floor === "ground")).toBe(true);
  });

  it("(b) foyer to the son room goes up the stairs and ends on the upper floor", () => {
    const path = nav.findPath(centre("ground", "g.foyer"), centre("upper", "u.son"));
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(path[0]!.floor).toBe("ground");
    expect(path.at(-1)!.floor).toBe("upper");
    expect(dist(path.at(-1)!, centre("upper", "u.son"))).toBeLessThan(0.5);
  });

  it("(c) master suite to the panic room", () => {
    const path = nav.findPath(centre("ground", "g.master"), centre("ground", "g.panic"));
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path.at(-1)!.floor).toBe("ground");
  });

  it("(d) panic room to the boathouse through the tunnel, ending on the shore", () => {
    const path = nav.findPath(centre("ground", "g.panic"), centre("shore", "grounds.boathouse"));
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(path.at(-1)!.floor).toBe("shore");
    expect(path.map((p) => p.floor).indexOf("shore")).toBeGreaterThan(0);
  });

  it("goes from the cellar up to the ground floor, and from the helipad to the study", () => {
    const up = nav.findPath(centre("lower", "l.cellar"), centre("ground", "g.foyer"));
    expect(up.at(-1)!.floor).toBe("ground");
    const study = nav.findPath({ floor: "grounds", x: 48, y: 68 }, centre("ground", "g.study"));
    expect(study.length).toBeGreaterThanOrEqual(3);
    expect(study[0]!.floor).toBe("grounds");
    expect(study.at(-1)!.floor).toBe("ground");
  });

  it("returns every waypoint on the 1 cm grid, and no absurd detours", () => {
    const from = centre("ground", "g.foyer"), to = centre("ground", "g.study");
    const path = nav.findPath(from, to);
    for (const p of path) {
      expect(Math.round(p.x * 100) / 100).toBe(p.x);
      expect(Math.round(p.y * 100) / 100).toBe(p.y);
    }
    expect(length(path)).toBeLessThan(3 * dist(from, to) + 10);
  });

  it("does not walk through walls: the library to the dining room has to use doors", () => {
    const from = centre("ground", "g.library"), to = centre("ground", "g.dining");
    const path = nav.findPath(from, to);
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(length(path)).toBeGreaterThan(dist(from, to) * 1.05);
  });

  it("can reach every room from the foyer, except the open stairwell void and the neighbouring hill villas", () => {
    const start = centre("ground", "g.foyer");
    const unreachable: string[] = [];
    for (const floor of map.floors) {
      for (const r of floor.rooms) {
        if (r.id === "u.void" || r.id.startsWith("grounds.villa-")) continue;
        if (nav.findPath(start, centre(floor.id, r.id)).length === 0) unreachable.push(`${floor.id}:${r.id}`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it("lets agents through every doorway that has floor on both sides", () => {
    const shut: string[] = [];
    for (const floor of map.floors) {
      for (const d of floor.doors) {
        const walk = (dx: number, dy: number) => nav.isWalkable({ floor: floor.id, x: d.at.x + dx, y: d.at.y + dy });
        const throughGoing = (walk(-1, 0) && walk(1, 0)) || (walk(0, -1) && walk(0, 1)); // not a door onto a void edge or a drop
        if (throughGoing && !nav.isWalkable({ floor: floor.id, x: d.at.x, y: d.at.y })) shut.push(`${floor.id}:${d.id}`);
      }
    }
    expect(shut).toEqual([]);
  });

  it("returns an empty path for a point far off the mesh, and the same answer twice", () => {
    expect(nav.findPath({ floor: "ground", x: -35, y: 110 }, centre("ground", "g.study"))).toEqual([]);
    const a = nav.findPath(centre("ground", "g.foyer"), centre("upper", "u.son"));
    expect(nav.findPath(centre("ground", "g.foyer"), centre("upper", "u.son"))).toEqual(a);
  });

  it("keeps windows closed to movement: inside to outside through the library west window is not a straight line", () => {
    const path = nav.findPath({ floor: "ground", x: 19.5, y: 50 }, { floor: "grounds", x: 16.5, y: 50 });
    expect(path.length).not.toBe(2);
  });

  it("gives the same answers in Node as the Web Worker debug page (client/nav-debug.html) did in Chromium", () => {
    const expected: [Pos, Pos, number, number][] = [
      [centre("ground", "g.foyer"), centre("ground", "g.study"), 9, 23.25],
      [centre("ground", "g.foyer"), centre("upper", "u.son"), 9, 35.06],
      [centre("ground", "g.master"), centre("ground", "g.panic"), 6, 20.37],
      [centre("ground", "g.panic"), centre("shore", "grounds.boathouse"), 4, 42.62],
      [{ floor: "grounds", x: 48, y: 68 }, centre("ground", "g.study"), 15, 37.64],
    ];
    for (const [from, to, points, len] of expected) {
      const path = nav.findPath(from, to);
      expect(path.length).toBe(points);
      expect(Math.round(length(path) * 100) / 100).toBe(len);
    }
  });

  it("isWalkable names the right floor where two floors share a height (a click must not land on a floor that is not there)", () => {
    const panic = centre("ground", "g.panic");
    const at = (floor: "grounds" | "ground" | "upper" | "hill", x: number, y: number) => ({ floor, x, y });
    expect(nav.isWalkable(at("ground", panic.x, panic.y))).toBe(true);
    expect(nav.isWalkable(at("grounds", panic.x, panic.y))).toBe(false); // inside the house, not open ground
    // The hill floor shares a height with the upper floor but has nothing over the house.
    const son = centre("upper", "u.son");
    expect(nav.isWalkable(at("upper", son.x, son.y))).toBe(true);
    expect(nav.isWalkable(at("hill", son.x, son.y))).toBe(false);
    expect(nav.isWalkable(at("grounds", 48, 68))).toBe(true); // the helipad is open ground
  });
});
