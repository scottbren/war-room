import { describe, expect, it } from "vitest";
import type { MapFile } from "@war-room/content";
import { createLos } from "../src/los";

const rect = (x0: number, y0: number, x1: number, y1: number) => ({ min: { x: x0, y: y0 }, max: { x: x1, y: y1 } });
const wall = (id: string, ax: number, ay: number, bx: number, by: number) => ({
  id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: 0.4, height: 3, material: "reinforced" as const, destructible: true,
});
const base = { rooms: [], doors: [], openings: [], cover: [] };

/**
 * A house wall at y = 10 (x 0..20) and another at x = 25 (y 0..20), both solid, as derived walls are: windows do not
 * cut them. A shuttered window sits at (10,10) and a bare slit at (5,10). The yard is the `grounds` floor, the house is
 * `ground`, both at height 0; `upper` is a different height.
 */
const map: MapFile = {
  id: "los-windows",
  version: 1,
  bounds: rect(0, 0, 30, 30),
  floors: [
    { id: "grounds", elevation: 0, ...base, walls: [], windows: [] },
    {
      id: "ground",
      elevation: 0,
      ...base,
      walls: [wall("w.south", 0, 10, 20, 10), wall("w.east", 25, 0, 25, 20)],
      windows: [
        { id: "win.shutter", at: { x: 10, y: 10 }, width: 2, between: ["g.a", "outside"], shutter: true, blastRated: true },
        { id: "win.slit", at: { x: 5, y: 10 }, width: 0.5, between: ["g.a", "outside"], shutter: false, blastRated: true },
        { id: "win.east", at: { x: 25, y: 10 }, width: 2, between: ["g.a", "outside"], shutter: true, blastRated: true },
      ],
    },
    { id: "upper", elevation: 4, ...base, walls: [], windows: [] },
  ],
  verticalLinks: [],
  zones: [],
  markers: [],
};

const yard = (x: number, y: number) => ({ floor: "grounds" as const, x, y });
const house = (x: number, y: number) => ({ floor: "ground" as const, x, y });

describe("los: windows in solid walls", () => {
  it("a solid wall blocks, but a window in it passes sight, from either side and across the yard/house floors", () => {
    const los = createLos(map);
    expect(los.sight(house(2, 5), yard(2, 15)).visible).toBe(false); // plain wall
    expect(los.sight(house(10, 5), yard(10, 15)).visible).toBe(true); // through the shuttered window, open
    expect(los.sight(yard(10, 15), house(10, 5)).visible).toBe(true);
    expect(los.sight(house(5, 5), house(5, 15)).visible).toBe(true); // a bare slit
  });

  it("a closed shutter blocks it again, and opening restores it", () => {
    const los = createLos(map);
    los.setShutter("win.shutter", "closed");
    expect(los.sight(house(10, 5), yard(10, 15)).visible).toBe(false);
    los.setShutter("win.shutter", "open");
    expect(los.sight(house(10, 5), yard(10, 15)).visible).toBe(true);
  });

  it("works for a window in a vertical (east) wall too", () => {
    const los = createLos(map);
    expect(los.sight(house(21, 10.5), yard(29, 10.5)).visible).toBe(true);
    los.setShutter("win.east", "closed");
    expect(los.sight(house(21, 10.5), yard(29, 10.5)).visible).toBe(false);
  });

  it("floors at different heights still do not see each other except through a void", () => {
    const los = createLos(map);
    expect(los.sight(house(10, 5), { floor: "upper", x: 10, y: 15 }).visible).toBe(false);
  });
});
