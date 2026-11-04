import { describe, expect, it } from "vitest";
import type { MapFile } from "@war-room/content";
import { createLos, effectiveRange } from "../src/los";
import type { Los } from "../src/los";

const rect = (x0: number, y0: number, x1: number, y1: number) => ({ min: { x: x0, y: y0 }, max: { x: x1, y: y1 } });
const wall = (id: string, ax: number, ay: number, bx: number, by: number) => ({
  id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: 0.2, height: 3, material: "plaster" as const, destructible: true,
});
const cover = (id: string, r: ReturnType<typeof rect>, type: "light" | "heavy" | "concealment", height: number) => ({
  id, rect: r, type, height, facing: "all" as const, destructible: true,
});

/**
 * Two rooms side by side (A x0..10, B x10..20, y0..10) joined by a door at (10,5), 1 m wide, plus a
 * second room C north of B with an L corner, and an upper floor with a gallery that looks down into room A.
 */
function losMap(doorState: "open" | "closed" | "locked" = "closed"): MapFile {
  return {
    id: "los-test",
    version: 1,
    bounds: rect(0, 0, 30, 30),
    floors: [
      {
        id: "ground",
        elevation: 0,
        rooms: [
          { id: "g.a", name: "A", rect: rect(0, 0, 10, 10), ceiling: 8, tags: ["interior"] },
          { id: "g.b", name: "B", rect: rect(10, 0, 20, 10), ceiling: 3, tags: ["interior"] },
        ],
        walls: [wall("w.ab.1", 10, 0, 10, 4.5), wall("w.ab.2", 10, 5.5, 10, 10), wall("w.corner", 15, 5, 15, 10)],
        doors: [{ id: "d.ab", at: { x: 10, y: 5 }, width: 1, between: ["g.a", "g.b"], kind: "standard", state: doorState, breach: ["manual"] }],
        windows: [{ id: "win.b", at: { x: 18, y: 10 }, width: 1.8, between: ["g.b", "outside"], shutter: true, blastRated: false }],
        openings: [],
        cover: [
          cover("cover.planter", rect(3, 3, 4, 4), "light", 0.8),
          cover("cover.pillar", rect(3, 7, 4, 8), "heavy", 3),
          cover("cover.hedge", rect(6, 1, 7, 2), "concealment", 1.5),
          cover("cover.rug", rect(5, 8, 6, 9), "light", 0.1),
        ],
      },
      {
        id: "upper",
        elevation: 4,
        rooms: [
          { id: "u.gallery", name: "Gallery", rect: rect(0, 10, 10, 14), ceiling: 3, tags: ["interior"] },
          { id: "u.void", name: "Void", rect: rect(0, 0, 10, 10), ceiling: 3, tags: ["void"] },
        ],
        walls: [],
        doors: [],
        windows: [],
        openings: [{ id: "op.void", rect: rect(0, 0, 10, 10), kind: "gallery-void", below: "ground" }],
        cover: [cover("cover.rail", rect(0, 9.9, 10, 10.1), "light", 1.1)],
      },
    ],
    verticalLinks: [],
    zones: [],
    markers: [],
  };
}

const g = (x: number, y: number) => ({ floor: "ground" as const, x, y });
const u = (x: number, y: number) => ({ floor: "upper" as const, x, y });
let los: Los;
const fresh = (state: "open" | "closed" | "locked" = "closed") => (los = createLos(losMap(state)));

describe("los: walls and doors", () => {
  it("sees along a room and through an open door, and is blocked by a closed or locked one", () => {
    expect(fresh("open").sight(g(5, 5), g(15, 5)).visible).toBe(true);
    expect(fresh("closed").sight(g(5, 5), g(15, 5)).visible).toBe(false);
    expect(fresh("locked").sight(g(5, 5), g(15, 5)).visible).toBe(false);
  });

  it("a wall blocks sight, and sight inside one room is clear", () => {
    fresh("open");
    expect(los.sight(g(5, 2), g(15, 2)).visible).toBe(false); // through the wall, away from the door
    expect(los.sight(g(12, 2), g(18, 2)).visible).toBe(true);
  });

  it("doors update their cells when opened, closed and breached", () => {
    fresh("closed");
    expect(los.sight(g(5, 5), g(15, 5)).visible).toBe(false);
    los.setDoor("d.ab", "open");
    expect(los.sight(g(5, 5), g(15, 5)).visible).toBe(true);
    los.setDoor("d.ab", "closed");
    expect(los.sight(g(5, 5), g(15, 5)).visible).toBe(false);
    los.setDoor("d.ab", "breached");
    expect(los.sight(g(5, 5), g(15, 5)).visible).toBe(true);
    expect(() => los.setDoor("d.nope", "open")).toThrow(/d\.nope/);
  });

  it("is blocked around a corner", () => {
    fresh("open");
    // wall at x=15 from y=5 to 10: from (12,8) to (18,8) crosses it; from (12,2) to (18,8) clips below the end of the wall? no: it crosses at y=5.. so test a true corner
    expect(los.sight(g(12, 8), g(18, 8)).visible).toBe(false);
    expect(los.sight(g(12, 3), g(18, 3)).visible).toBe(true);
    // around the wall end at (15,5): from (14,9) to (16,9) is blocked by the wall, from (14,4) to (16,6) peeks past the end
    expect(los.sight(g(14, 9), g(16, 9)).visible).toBe(false);
  });

  it("closed shutters block sight through a window, open ones do not", () => {
    fresh("open");
    expect(los.sight(g(18, 8), g(18, 12)).visible).toBe(true); // out through the glass
    los.setShutter("win.b", "closed");
    expect(los.sight(g(18, 8), g(18, 12)).visible).toBe(false);
    los.setShutter("win.b", "open");
    expect(los.sight(g(18, 8), g(18, 12)).visible).toBe(true);
  });
});

describe("los: cover and concealment", () => {
  it("a crouched target behind a planter is hidden while a standing one is visible", () => {
    fresh("open");
    expect(los.sight(g(1, 3.5), g(7, 3.5), "standing").visible).toBe(true);
    expect(los.sight(g(1, 3.5), g(7, 3.5), "crouched").visible).toBe(false);
  });

  it("tall cover blocks both stances, and very low cover (a rug) blocks neither", () => {
    fresh("open");
    expect(los.sight(g(1, 7.5), g(7, 7.5), "standing").visible).toBe(false);
    expect(los.sight(g(1, 8.5), g(8, 8.5), "crouched").visible).toBe(true);
  });

  it("concealment does not block sight but flags the target as concealed, which halves detection range", () => {
    fresh("open");
    const hidden = los.sight(g(1, 1.5), g(8, 1.5)); // hedge between them
    expect(hidden.visible).toBe(true);
    expect(hidden.concealed).toBe(true);
    expect(los.sight(g(1, 5), g(8, 5)).concealed).toBe(false);
    expect(los.sight(g(1, 1.5), g(6.5, 1.5)).concealed).toBe(true); // standing in the hedge
    expect(effectiveRange(3000, true)).toBe(1500);
    expect(effectiveRange(3000, false)).toBe(3000);
    expect(effectiveRange(3001, true)).toBe(1500);
  });
});

describe("los: vertical sight through the gallery void", () => {
  it("an observer in the gallery sees a target in the area under the void, and vice versa", () => {
    fresh("open");
    expect(los.sight(u(5, 12), g(5, 3)).visible).toBe(true);
    expect(los.sight(g(5, 3), u(5, 12)).visible).toBe(true);
  });

  it("does not see ground cells outside the void, other floors, or around ground walls", () => {
    fresh("open");
    expect(los.sight(u(5, 12), g(15, 3)).visible).toBe(false); // room B is not under the void
    fresh("closed");
    expect(los.sight(u(5, 12), g(15, 5)).visible).toBe(false);
  });

  it("the ground leg obeys cover: a crouched target behind the planter is hidden from the gallery", () => {
    fresh("open");
    expect(los.sight(u(8, 12), g(7, 3.5), "standing").visible).toBe(true);
    expect(los.sight(u(1, 12), g(5, 3.5), "crouched").visible).toBe(true); // the ray from the clamped edge does not cross the planter
    expect(los.sight(u(5, 12), g(3.5, 1), "crouched").visible).toBe(false); // this ray crosses the planter
  });
});

describe("los: grid and determinism", () => {
  it("reports cell values: open 0, low cover 1, full block 2", () => {
    fresh("open");
    expect(los.cellValue("ground", 6.25, 5.25)).toBe(0);
    expect(los.cellValue("ground", 3.25, 3.25)).toBe(1);
    expect(los.cellValue("ground", 3.25, 7.25)).toBe(2);
    expect(los.cellValue("ground", 10.25, 2.25)).toBe(2);
  });

  it("gives the same answers from two instances and for repeated queries", () => {
    const a = createLos(losMap("open")), b = createLos(losMap("open"));
    for (const [x, y] of [[1, 1], [9, 9], [12, 3], [18, 8], [5, 5]] as const) {
      expect(a.sight(g(2, 2), g(x, y))).toEqual(b.sight(g(2, 2), g(x, y)));
      expect(a.sight(g(2, 2), g(x, y))).toEqual(a.sight(g(2, 2), g(x, y)));
    }
  });

  it("a point to itself is visible, and queries outside the map are not", () => {
    fresh("open");
    expect(los.sight(g(5, 5), g(5, 5)).visible).toBe(true);
    expect(los.sight(g(5, 5), g(-50, 5)).visible).toBe(false);
  });

  it("sees a target that sits exactly on a cell corner, and from one corner to another", () => {
    fresh("open");
    for (const [x, y] of [[6, 6], [7, 5], [8, 4], [9.5, 3]] as const) {
      expect(los.sight(g(9, 9), g(x, y)).visible, `to ${x},${y}`).toBe(true);
      expect(los.sight(g(x, y), g(9, 9)).visible, `from ${x},${y}`).toBe(true);
    }
    expect(los.sight(g(2, 2), g(3, 3)).visible).toBe(true);
    expect(los.sight(g(3, 3), g(2, 2)).visible).toBe(true);
  });

  it("is symmetric for standing targets: if a sees b then b sees a, over a grid of points", () => {
    fresh("open");
    const pts: [number, number][] = [];
    for (let x = 1.13; x < 20; x += 2.25) for (let y = 0.77; y < 10; y += 1.75) pts.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
    let seen = 0;
    for (const a of pts) {
      for (const b of pts) {
        const ab = los.sight(g(...a), g(...b)).visible, ba = los.sight(g(...b), g(...a)).visible;
        expect(ab, `${a} <-> ${b}`).toBe(ba);
        if (ab) seen++;
      }
    }
    expect(seen).toBeGreaterThan(pts.length); // not trivially all blocked
  });

  it("a ray starting exactly on a cell corner and heading down-left agrees with the reverse ray", () => {
    const map = losMap("open");
    // blocker in the cell just up-left of the corner (1,2)->(1.0,1.0): put a tall pillar at x 0.5..1, y 1..1.5
    map.floors[0]!.cover.push(cover("cover.corner-pillar", rect(0.5, 1, 1, 1.5), "heavy", 3));
    const l = createLos(map);
    const forward = l.sight(g(1, 1), g(0.5, 0.5)).visible;
    expect(forward).toBe(l.sight(g(0.5, 0.5), g(1, 1)).visible);
    expect(forward).toBe(true); // the ray only touches the pillar cell at a single point
  });

  it("refuses a diagonal wall instead of silently blocking its whole bounding box", () => {
    const map = losMap("open");
    map.floors[0]!.walls.push(wall("w.diag", 1, 1, 5, 5));
    expect(() => createLos(map)).toThrow(/diagonal/);
  });
});
