import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import charonJson from "../../content/maps/charon.json";
import { FLOOR_KEYS, MATERIALS, groupBoxes, planGreybox, toggleFloor } from "../src/greybox/plan";
import type { Box } from "../src/greybox/plan";

const map = MapFile.parse(charonJson);
const boxes = planGreybox(map);
const byId = (id: string): Box => {
  const box = boxes.find((b) => b.id === id);
  if (!box) throw new Error(`no box ${id}`);
  return box;
};
const floorElevation = (id: string) => map.floors.find((f) => f.id === id)!.elevation;

describe("planGreybox: basics", () => {
  it("gives every box finite numbers, positive sizes and a known material", () => {
    expect(boxes.length).toBeGreaterThan(200);
    for (const b of boxes) {
      for (const n of [...b.center, ...b.size]) expect(Number.isFinite(n), b.id).toBe(true);
      for (const s of b.size) expect(s, b.id).toBeGreaterThan(0);
      expect(MATERIALS[b.material], `${b.id} -> ${b.material}`).toBeDefined();
    }
  });

  it("gives every box a unique id and a real floor, and every floor gets boxes", () => {
    expect(new Set(boxes.map((b) => b.id)).size).toBe(boxes.length);
    for (const floor of ["grounds", "ground", "upper", "roof"]) {
      expect(boxes.some((b) => b.floor === floor), floor).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(planGreybox(map)).toEqual(boxes);
  });
});

describe("planGreybox: coordinates (map x, y, z -> Babylon x, z, y)", () => {
  it("lays a room slab so its top is at the floor elevation", () => {
    const hall = byId("slab:g.grand-hall"); // map rect [38,38]-[62,52], floor ground at z = 0
    expect(hall.center).toEqual([50, -0.1, 45]);
    expect(hall.size).toEqual([24, 0.2, 14]);
    const upperHall = byId("slab:u.gallery");
    expect(upperHall.center[1]).toBeCloseTo(floorElevation("upper") - 0.1, 10);
  });

  it("makes no slab for the open gallery void, but one for every other room", () => {
    expect(boxes.some((b) => b.id === "slab:u.void")).toBe(false);
    const rooms = map.floors.flatMap((f) => f.rooms).filter((r) => !r.tags.includes("void"));
    expect(boxes.filter((b) => b.id.startsWith("slab:"))).toHaveLength(rooms.length);
  });

  it("makes one box per wall, standing on its floor", () => {
    for (const floor of map.floors) {
      for (const w of floor.walls) {
        const b = byId(`wall:${w.id}`);
        expect(b.floor).toBe(floor.id);
        expect(b.size[1]).toBe(w.height);
        expect(b.center[1]).toBeCloseTo(floor.elevation + w.height / 2, 10);
      }
    }
    expect(boxes.filter((b) => b.id.startsWith("wall:"))).toHaveLength(map.floors.reduce((n, f) => n + f.walls.length, 0));
  });

  it("orients walls along their length: vertical walls are long in z, horizontal ones in x", () => {
    const vertical = map.floors[0]!.walls.find((w) => w.id === "w.fixed.perimeter.west")!;
    const v = byId(`wall:${vertical.id}`);
    expect(v.size[0]).toBe(vertical.thickness);
    expect(v.size[2]).toBeGreaterThan(80);
    const horizontal = byId("wall:w.fixed.perimeter.north.1");
    expect(horizontal.size[2]).toBe(0.6);
    expect(horizontal.size[0]).toBeGreaterThan(66);
  });

  it("extends wall ends by half a thickness to close corners, but not where a door gap starts", () => {
    // west wall (0,0)-(0,80), both ends free: 80 + 0.6, centered
    const west = byId("wall:w.fixed.perimeter.west");
    expect(west.size[2]).toBeCloseTo(80.6, 10);
    expect(west.center[2]).toBeCloseTo(40, 10);
    // north.1 (0,80)-(66,80): start is a corner (extended), end at x = 66 is the gate gap (not extended)
    const north = byId("wall:w.fixed.perimeter.north.1");
    expect(north.size[0]).toBeCloseTo(66.3, 10);
    expect(north.center[0]).toBeCloseTo(32.85, 10);
  });

  it("builds cover as a block of its own height, standing on its floor", () => {
    const planter = byId("cover:cover.planter.1"); // rect [29.5,15.4]-[30.5,16], height 0.8, grounds
    expect(planter.floor).toBe("grounds");
    expect(planter.center[0]).toBeCloseTo(30, 10);
    expect(planter.center[1]).toBeCloseTo(0.4, 10);
    expect(planter.center[2]).toBeCloseTo(15.7, 10);
    expect(planter.size[0]).toBeCloseTo(1, 10);
    expect(planter.size[1]).toBeCloseTo(0.8, 10);
    expect(planter.size[2]).toBeCloseTo(0.6, 10);
    expect(byId("cover:cover.parapet.south.west").center[1]).toBeCloseTo(floorElevation("roof") + 0.5, 10);
  });

  it("colors cover by type: heavy blue-grey, light amber, concealment green and see-through", () => {
    expect(byId("cover:cover.suv.1").material).toBe("cover:heavy");
    expect(byId("cover:cover.planter.1").material).toBe("cover:light");
    const [hr, , hb] = MATERIALS["cover:heavy"].color;
    expect(hb).toBeGreaterThan(hr); // blue-ish
    const [lr, lg, lb] = MATERIALS["cover:light"].color;
    expect(lr).toBeGreaterThan(lb);
    expect(lg).toBeGreaterThan(lb); // amber: red and green over blue
    const [cr, cg] = MATERIALS["cover:concealment"].color;
    expect(cg).toBeGreaterThan(cr);
    expect(MATERIALS["cover:concealment"].alpha).toBeLessThan(1);
  });

  it("lays zones as thin translucent overlays on the grounds, the pool and the sea included", () => {
    const pool = byId("zone:zone.pool"); // the courtyard pool, [45,20]-[55,34], on the ground floor
    expect(pool.floor).toBe("ground");
    expect(pool.center[0]).toBe(50);
    expect(pool.center[2]).toBe(27);
    expect(pool.size[0]).toBe(10);
    expect(pool.size[2]).toBe(14);
    expect(pool.size[1]).toBeLessThan(0.1);
    expect(pool.center[1]).toBeGreaterThan(0);
    const sea = byId("zone:zone.sea");
    expect(sea.size[0]).toBe(140);
    expect(sea.size[2]).toBe(40);
    expect(MATERIALS["zone:pool"].alpha).toBeLessThan(1);
    expect(MATERIALS["zone:sea"].alpha).toBeLessThan(1);
  });

  it("puts one terrain plane under the whole map bounds", () => {
    const t = byId("terrain");
    expect(t.size[0]).toBe(180);
    expect(t.size[2]).toBe(134);
    expect(t.center[0]).toBe(50);
    expect(t.center[2]).toBe(27);
    expect(t.center[1] + t.size[1] / 2).toBeLessThan(0);
  });

  it("keeps the whole scene within the map footprint and below the roof parapet", () => {
    const eps = 1;
    for (const b of boxes) {
      expect(b.center[0] - b.size[0] / 2, b.id).toBeGreaterThanOrEqual(map.bounds.min.x - eps);
      expect(b.center[0] + b.size[0] / 2, b.id).toBeLessThanOrEqual(map.bounds.max.x + eps);
      expect(b.center[2] - b.size[2] / 2, b.id).toBeGreaterThanOrEqual(map.bounds.min.y - eps);
      expect(b.center[2] + b.size[2] / 2, b.id).toBeLessThanOrEqual(map.bounds.max.y + eps);
      expect(b.center[1] + b.size[1] / 2, b.id).toBeLessThanOrEqual(20);
    }
  });
});

describe("groupBoxes", () => {
  it("groups by floor and material, sorted, losing no box", () => {
    const groups = groupBoxes(boxes);
    expect(groups.reduce((n, g) => n + g.boxes.length, 0)).toBe(boxes.length);
    for (const g of groups) {
      expect(g.boxes.length).toBeGreaterThan(0);
      for (const b of g.boxes) {
        expect(b.floor).toBe(g.floor);
        expect(b.material).toBe(g.material);
      }
    }
    const keys = groups.map((g) => g.key);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(groups.length).toBeLessThan(60); // merged meshes keep draw calls low
  });
});

describe("floor toggles", () => {
  it("maps keys 1-4 to grounds, ground, upper, roof", () => {
    expect(FLOOR_KEYS).toEqual({ "1": "grounds", "2": "ground", "3": "upper", "4": "roof" });
  });

  it("toggles one floor without touching the others, and never mutates its input", () => {
    const all = { grounds: true, ground: true, upper: true, roof: true };
    const next = toggleFloor(all, "upper");
    expect(next).toEqual({ grounds: true, ground: true, upper: false, roof: true });
    expect(all.upper).toBe(true);
    expect(toggleFloor(next, "upper")).toEqual(all);
  });
});
