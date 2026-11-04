import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import charonJson from "../../content/maps/charon.json";
import { FLOOR_KEYS, MATERIALS, allFloorsVisible, groupBoxes, planGreybox, toggleFloor } from "../src/greybox/plan";
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

describe("planGreybox: raised ground", () => {
  it("puts a solid block under each hill lawn, from the terrain up to just below the hill floor", () => {
    const hillZones = map.zones.filter((z) => z.floor === "hill");
    expect(hillZones.length).toBeGreaterThan(0);
    for (const zone of hillZones) {
      const block = byId(`plinth:${zone.id}`);
      const hillTop = floorElevation("hill");
      expect(block.floor).toBe("hill");
      expect(block.material).toBe("terrain");
      expect(block.center[1] + block.size[1] / 2).toBeCloseTo(hillTop - 0.01, 10); // top just under the villa slabs
      expect(block.center[1] - block.size[1] / 2).toBeLessThanOrEqual(0); // reaches down to the ground
      expect(block.center[0]).toBeCloseTo((zone.rect.min.x + zone.rect.max.x) / 2, 10);
      expect(block.size[0]).toBeCloseTo(zone.rect.max.x - zone.rect.min.x, 10);
    }
  });

  it("every hill room lies on a plinth, so no villa floats", () => {
    const blocks = boxes.filter((b) => b.id.startsWith("plinth:"));
    for (const room of map.floors.find((f) => f.id === "hill")!.rooms) {
      const cx = (room.rect.min.x + room.rect.max.x) / 2, cz = (room.rect.min.y + room.rect.max.y) / 2;
      const under = blocks.some((b) => Math.abs(cx - b.center[0]) <= b.size[0] / 2 && Math.abs(cz - b.center[2]) <= b.size[2] / 2);
      expect(under, room.id).toBe(true);
    }
  });
});

describe("planGreybox: coordinates (map x, y, z -> Babylon x, z, y)", () => {
  it("lays a room slab so its top is at the floor elevation", () => {
    const hall = byId("slab:g.grand-hall"); // map rect [30,41]-[52,52], floor ground at z = 0
    expect(hall.center).toEqual([41, -0.1, 46.5]);
    expect(hall.size).toEqual([22, 0.2, 11]);
    const upperHall = byId("slab:u.gallery");
    expect(upperHall.center[1]).toBeCloseTo(floorElevation("upper") - 0.1, 10);
  });

  it("colors open decks and terraces warm so a roof reads as a place, and enclosed rooms grey", () => {
    expect(byId("slab:r.deck.a").material).toBe("slab:deck");
    expect(byId("slab:u.terrace.c").material).toBe("slab:deck");
    expect(byId("slab:r.pavilion").material).toBe("slab");
    expect(byId("slab:g.grand-hall").material).toBe("slab");
    const [r, , b] = MATERIALS["slab:deck"].color;
    expect(r).toBeGreaterThan(b); // warm
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
    const vertical = map.floors[0]!.walls.find((w) => w.id === "w.fixed.perimeter.west.1")!;
    const v = byId(`wall:${vertical.id}`);
    expect(v.size[0]).toBe(vertical.thickness);
    expect(v.size[2]).toBeGreaterThan(60);
    const horizontal = byId("wall:w.fixed.perimeter.north.1");
    expect(horizontal.size[2]).toBe(0.6);
    expect(horizontal.size[0]).toBeGreaterThan(66);
  });

  it("extends wall ends by half a thickness to close corners, but not where a door gap starts", () => {
    // west.1 (0,0)-(0,63): the start is a corner (extended), the end is the staff gate gap (not extended)
    const west = byId("wall:w.fixed.perimeter.west.1");
    expect(west.size[2]).toBeCloseTo(63.3, 10);
    expect(west.center[2]).toBeCloseTo(31.35, 10);
    // north.1 (0,80)-(66,80): start is a corner (extended), end at x = 66 is the gate gap (not extended)
    const north = byId("wall:w.fixed.perimeter.north.1");
    expect(north.size[0]).toBeCloseTo(66.3, 10);
    expect(north.center[0]).toBeCloseTo(32.85, 10);
  });

  it("builds cover as a block of its own height, standing on its floor", () => {
    const bar = byId("cover:cover.pool-bar"); // rect [66,24]-[70,25], height 1.1, grounds
    expect(bar.floor).toBe("grounds");
    expect(bar.center[0]).toBeCloseTo(68, 10);
    expect(bar.center[1]).toBeCloseTo(0.55, 10);
    expect(bar.center[2]).toBeCloseTo(24.5, 10);
    expect(bar.size[0]).toBeCloseTo(4, 10);
    expect(bar.size[1]).toBeCloseTo(1.1, 10);
    expect(bar.size[2]).toBeCloseTo(1, 10);
    expect(byId("cover:cover.parapet.a.west").center[1]).toBeCloseTo(floorElevation("roof") + 0.5, 10);
  });

  it("colors cover by type: heavy blue-grey, light amber, concealment green and see-through", () => {
    expect(byId("cover:cover.suv.1").material).toBe("cover:heavy");
    expect(byId("cover:cover.pool-bar").material).toBe("cover:light");
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
    const pool = byId("zone:zone.pool"); // the long pool in the notch, [56,14]-[80,23], on the grounds
    expect(pool.floor).toBe("grounds");
    expect(pool.center[0]).toBe(68);
    expect(pool.center[2]).toBe(18.5);
    expect(pool.size[0]).toBe(24);
    expect(pool.size[2]).toBe(9);
    expect(pool.size[1]).toBeLessThan(0.1);
    expect(pool.center[1]).toBeGreaterThan(0);
    const sea = byId("zone:zone.sea");
    expect(sea.size[0]).toBe(140);
    expect(sea.size[2]).toBe(40);
    expect(MATERIALS["zone:pool"].alpha).toBeLessThan(1);
    expect(MATERIALS["zone:sea"].alpha).toBeLessThan(1);
  });

  it("draws path (terrace) overlays above the garden overlay they cross, and ponds (pool) above both", () => {
    const garden = byId("zone:zone.garden-east");
    const path = byId("zone:zone.garden-path.ns");
    const pond = byId("zone:zone.grove-pond");
    expect(path.center[1]).toBeGreaterThan(garden.center[1]);
    expect(pond.center[1]).toBeGreaterThan(path.center[1]);
  });

  it("draws a stairs link as real steps: a stepped flight rising to the upper floor (a service-style flight is solid)", () => {
    const steps = boxes.filter((b) => b.id.startsWith("stairs:link.shore-stair:"));
    expect(steps.length).toBeGreaterThanOrEqual(10);
    const tops = steps.map((b) => b.center[1] + b.size[1] / 2);
    for (let i = 1; i < tops.length; i++) expect(tops[i]!, `step ${i}`).toBeGreaterThan(tops[i - 1]!);
    for (const b of steps) {
      expect(b.material).toBe("stairs");
      expect(b.center[1] - b.size[1] / 2).toBeCloseTo(floorElevation("shore"), 5); // solid down to the floor
    }
  });

  it("draws the grand stairs as floating flights: thin open treads on a spine, glass balustrades, nothing solid underneath", () => {
    for (const side of ["central"] as const) {
      const id = `link.grand-stairs.${side}`;
      const link = map.verticalLinks.find((l) => l.id === id)!;
      const treads = boxes.filter((b) => b.id.startsWith(`stairs:${id}:`));
      expect(treads.length).toBeGreaterThanOrEqual(14);
      expect(treads.length).toBeLessThanOrEqual(20);
      const tops = treads.map((b) => b.center[1] + b.size[1] / 2);
      for (let i = 1; i < tops.length; i++) expect(tops[i]!, `${id} tread ${i}`).toBeGreaterThan(tops[i - 1]!);
      expect(tops[0]!).toBeLessThanOrEqual(0.4); // a low first step
      expect(tops[tops.length - 1]!).toBeCloseTo(floorElevation("upper"), 5); // the last tread is level with the gallery
      for (const t of treads) {
        expect(t.material).toBe("stairs");
        expect(t.floor).toBe("ground");
        expect(t.size[1], "a thin tread").toBeLessThanOrEqual(0.2);
        expect(t.size[0], "a 3.6 m wide flight").toBeCloseTo(3.6, 5);
        expect(t.center[0]).toBeCloseTo(link.from.at.x, 5);
      }
      const first = treads[0]!, last = treads[treads.length - 1]!;
      expect(first.center[2] + first.size[2] / 2).toBeCloseTo(link.from.at.y, 5); // the foot is at the south end...
      expect(last.center[2] - last.size[2] / 2).toBeCloseTo(link.to.at.y, 5); // ...and the flight rises north
      // The spine carries the treads and leaves open air under the high steps; glass rails line both sides.
      const spine = boxes.filter((b) => b.id.startsWith(`spine:${id}:`));
      expect(spine.length).toBe(treads.length);
      for (const b of spine) expect(b.material).toBe("stairs:spine");
      const highSpine = spine[spine.length - 1]!;
      expect(highSpine.center[1] - highSpine.size[1] / 2).toBeGreaterThan(3); // open air under the top
      const rails = boxes.filter((b) => b.id.startsWith(`rail:${id}:`));
      expect(rails.length).toBe(treads.length * 2);
      for (const b of rails) expect(b.material).toBe("window:glass");
      // Nothing solid on the hall floor under the flight.
      for (const b of [...treads, ...spine, ...rails]) expect(b.center[1] - b.size[1] / 2, b.id).toBeGreaterThan(0.05);
    }
  });

  it("draws no steps for a stairs link with no horizontal run (the service stair), and none for non-stair links", () => {
    expect(boxes.filter((b) => b.id.startsWith("stairs:link.stairs:"))).toEqual([]);
    expect(boxes.filter((b) => b.id.startsWith("stairs:link.shaft"))).toEqual([]);
    expect(boxes.filter((b) => b.id.startsWith("stairs:link.tunnel"))).toEqual([]);
  });

  it("draws every window as a pane proud of its wall, at sill height, in the glass or slit material", () => {
    const windows = map.floors.flatMap((f) => f.windows.map((w) => ({ f, w })));
    expect(windows.length).toBeGreaterThanOrEqual(20);
    for (const { f, w } of windows) {
      const pane = byId(`window:${w.id}`);
      expect(pane.floor, w.id).toBe(f.id);
      expect(pane.material, w.id).toBe(w.width <= 0.5 ? "window:slit" : "window:glass");
      expect(pane.center[1], w.id).toBeGreaterThan(f.elevation + 0.8); // above the sill
      expect(pane.center[1], w.id).toBeLessThan(f.elevation + 2.6);
      // the pane runs along the wall for the window's width and pokes out of both faces of the wall
      const wall = f.walls.find((x) => (x.a.x === x.b.x ? x.a.x === w.at.x : x.a.y === w.at.y) && Math.min(x.a.x, x.b.x) - 0.5 <= w.at.x && Math.max(x.a.x, x.b.x) + 0.5 >= w.at.x && Math.min(x.a.y, x.b.y) - 0.5 <= w.at.y && Math.max(x.a.y, x.b.y) + 0.5 >= w.at.y);
      const vertical = wall!.a.x === wall!.b.x;
      const along = vertical ? pane.size[2] : pane.size[0];
      const across = vertical ? pane.size[0] : pane.size[2];
      expect(along, w.id).toBeCloseTo(w.width, 5);
      expect(across, w.id).toBeGreaterThan(wall!.thickness);
    }
  });

  it("puts a steel shutter housing over each shuttered window, and none over an unshuttered slit", () => {
    for (const f of map.floors) {
      for (const w of f.windows) {
        const housing = boxes.find((b) => b.id === `shutter:${w.id}`);
        if (w.shutter) {
          expect(housing, w.id).toBeDefined();
          expect(housing!.material).toBe("window:shutter");
          expect(housing!.center[1]).toBeGreaterThan(byId(`window:${w.id}`).center[1]); // above the pane
        } else {
          expect(housing, w.id).toBeUndefined();
        }
      }
    }
  });

  it("does not punch a hole in the wall for a window (windows stand on solid wall)", () => {
    for (const f of map.floors) {
      for (const w of f.windows) {
        const wall = byId(`wall:${f.walls.find((x) => (x.a.x === x.b.x ? x.a.x === w.at.x : x.a.y === w.at.y) && Math.min(x.a.x, x.b.x) - 0.5 <= w.at.x && Math.max(x.a.x, x.b.x) + 0.5 >= w.at.x && Math.min(x.a.y, x.b.y) - 0.5 <= w.at.y && Math.max(x.a.y, x.b.y) + 0.5 >= w.at.y)!.id}`);
        expect(wall, w.id).toBeDefined();
      }
    }
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
    expect(groups.length).toBeLessThan(80); // merged meshes keep draw calls low
  });
});

describe("floor toggles", () => {
  it("maps keys 1-7 to grounds, ground, upper, roof, lower, shore, hill", () => {
    expect(FLOOR_KEYS).toEqual({ "1": "grounds", "2": "ground", "3": "upper", "4": "roof", "5": "lower", "6": "shore", "7": "hill" });
  });

  it("toggles one floor without touching the others, and never mutates its input", () => {
    const all = allFloorsVisible();
    expect(Object.keys(all).sort()).toEqual(["ground", "grounds", "hill", "lower", "roof", "shore", "upper"]);
    expect(Object.values(all).every(Boolean)).toBe(true);
    const next = toggleFloor(all, "upper");
    expect(next).toEqual({ ...all, upper: false });
    expect(all.upper).toBe(true);
    expect(toggleFloor(next, "upper")).toEqual(all);
  });
});
