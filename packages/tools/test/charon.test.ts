import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Floor, Room } from "@war-room/content";
import { deriveWalls, formatMap } from "../src/derive-walls";

const file = fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url));
const text = readFileSync(file, "utf8");
const map = MapFile.parse(JSON.parse(text));
const floor = (id: string): Floor => map.floors.find((f) => f.id === id)!;
const room = (floorId: string, id: string): Room => {
  const r = floor(floorId).rooms.find((x) => x.id === id);
  if (!r) throw new Error(`no room ${id} on ${floorId}`);
  return r;
};
const area = (r: { min: { x: number; y: number }; max: { x: number; y: number } }) => (r.max.x - r.min.x) * (r.max.y - r.min.y);
const rectOf = (x0: number, y0: number, x1: number, y1: number) => ({ min: { x: x0, y: y0 }, max: { x: x1, y: y1 } });

describe("charon.json: basics", () => {
  it("parses against the schema", () => {
    expect(map.id).toBe("charon");
    expect(map.version).toBe(2);
    expect(map.floors.map((f) => f.id)).toEqual(["grounds", "ground", "upper", "roof"]);
    expect(map.floors.map((f) => f.elevation)).toEqual([0, 0, 4, 8]);
  });

  it("has the expected room count per floor", () => {
    expect(floor("grounds").rooms).toHaveLength(15);
    expect(floor("ground").rooms).toHaveLength(16);
    expect(floor("upper").rooms).toHaveLength(17);
    expect(floor("roof").rooms).toHaveLength(3);
  });

  it("has unique ids across each floor and in every list", () => {
    const unique = (ids: string[]) => expect(new Set(ids).size).toBe(ids.length);
    for (const f of map.floors) {
      unique(f.rooms.map((r) => r.id));
      unique(f.walls.map((w) => w.id));
      unique(f.windows.map((w) => w.id));
      unique(f.cover.map((c) => c.id));
    }
    unique(map.floors.flatMap((f) => f.rooms.map((r) => r.id)));
    unique(map.floors.flatMap((f) => f.doors.map((d) => d.id)));
    unique(map.verticalLinks.map((l) => l.id));
    unique(map.zones.map((z) => z.id));
    unique(map.markers.map((m) => m.id));
  });

  it("has walls that match what derive-walls produces (nothing stale, nothing hand-edited)", () => {
    expect(deriveWalls(map)).toEqual(map);
    expect(formatMap(map)).toBe(text);
  });

  it("has no windows (a fortified home: shutters and blast-rated glass doors only)", () => {
    for (const f of map.floors) expect(f.windows).toEqual([]);
  });

  it("loads in the headless harness", async () => {
    const { loadMap } = await import("../src/headlessCore");
    expect(loadMap("charon").id).toBe("charon");
  });
});

describe("charon.json: the courtyard villa", () => {
  it("is a U: main block to the north, two wings, an open pool courtyard facing the sea", () => {
    expect(room("ground", "g.grand-hall").rect).toEqual(rectOf(38, 38, 62, 52));
    expect(room("ground", "g.courtyard").rect).toEqual(rectOf(42, 16, 58, 38));
    expect(room("ground", "g.courtyard").tags).toContain("exterior");
    // the house outline is the 44 x 40 box minus the courtyard notch
    const house = floor("ground").rooms.filter((r) => !r.tags.includes("exterior"));
    expect(house.reduce((sum, r) => sum + area(r.rect), 0)).toBe(44 * 40 - area(room("ground", "g.courtyard").rect));
    // wings: master suite west, panic room east, both reaching the southern edge (y = 16)
    expect(room("ground", "g.master").rect.min.y).toBe(16);
    expect(room("ground", "g.panic").rect.min.y).toBe(16);
  });

  it("leaves no unassigned space on either house floor", () => {
    expect(floor("ground").rooms.reduce((sum, r) => sum + area(r.rect), 0)).toBe(44 * 40);
    const upperHouse = floor("upper").rooms.filter((r) => r.tags.includes("interior"));
    expect(upperHouse.reduce((sum, r) => sum + area(r.rect), 0)).toBe(44 * 40);
  });

  it("has a double-height grand hall, a gallery walkway above it, and an open void between them", () => {
    expect(room("ground", "g.grand-hall").ceiling).toBe(8);
    expect(room("upper", "u.void").rect).toEqual(rectOf(38, 38, 62, 50));
    expect(room("upper", "u.void").tags).toContain("void");
    expect(room("upper", "u.gallery").rect).toEqual(rectOf(38, 50, 62, 52));
    const openings = floor("upper").openings;
    expect(openings).toContainEqual(expect.objectContaining({ kind: "gallery-void", below: "ground", rect: rectOf(38, 38, 62, 50) }));
    expect(openings).toContainEqual(expect.objectContaining({ kind: "gallery-void", below: "ground", rect: rectOf(42, 16, 58, 38) }));
  });

  it("has a grand staircase: two flights up the hall's side walls to the gallery, with stair bodies as cover", () => {
    const west = map.verticalLinks.find((l) => l.id === "link.grand-stairs.west")!;
    const east = map.verticalLinks.find((l) => l.id === "link.grand-stairs.east")!;
    for (const link of [west, east]) {
      expect(link).toMatchObject({ kind: "stairs", bidirectional: true, from: { floor: "ground" }, to: { floor: "upper" } });
      expect(link.restrictedTo).toBeUndefined();
    }
    expect(west.from.at).toEqual({ x: 40, y: 41 });
    expect(west.to.at).toEqual({ x: 40, y: 51 });
    expect(east.from.at).toEqual({ x: 60, y: 41 });
    expect(east.to.at).toEqual({ x: 60, y: 51 });
    const bodies = floor("ground").cover.filter((c) => c.id.startsWith("cover.grand-stair"));
    expect(bodies).toHaveLength(2);
    for (const b of bodies) expect(b).toMatchObject({ type: "heavy" });
  });

  it("has colonnaded arcades along both sides of the courtyard, with a column every few meters", () => {
    expect(room("ground", "g.loggia.w").tags).toEqual(expect.arrayContaining(["arcade", "hall"]));
    expect(room("ground", "g.loggia.e").tags).toEqual(expect.arrayContaining(["arcade", "hall"]));
    const columns = floor("ground").cover.filter((c) => c.id.startsWith("cover.column"));
    expect(columns.length).toBeGreaterThanOrEqual(10);
    for (const c of columns) expect(c.type).toBe("heavy");
    // no wall closes the arcades to the courtyard
    const along = (x: number) => floor("ground").walls.filter((w) => w.a.x === x && w.b.x === x && Math.min(w.a.y, w.b.y) >= 16 && Math.max(w.a.y, w.b.y) <= 38);
    expect(along(42)).toEqual([]);
    expect(along(58)).toEqual([]);
  });

  it("opens the courtyard to the sea through a wide balustrade gap, and to the grand hall through glass doors", () => {
    const doors = floor("ground").doors;
    const gap = doors.find((d) => d.between.includes("g.courtyard") && d.between.includes("outside"))!;
    expect(gap).toMatchObject({ at: { x: 50, y: 16 }, state: "open" });
    expect(gap.width).toBeGreaterThanOrEqual(6);
    const glass = doors.find((d) => d.between.includes("g.courtyard") && d.between.includes("g.grand-hall"))!;
    expect(glass).toMatchObject({ kind: "glass", at: { x: 50, y: 38 } });
  });

  it("has a pool and a fountain in the courtyard and a pool deck around them", () => {
    const pool = map.zones.find((z) => z.kind === "pool")!;
    expect(pool.floor).toBe("ground");
    expect(pool.rect.min.x).toBeGreaterThanOrEqual(42);
    expect(pool.rect.max.x).toBeLessThanOrEqual(58);
    expect(pool.rect.min.y).toBeGreaterThanOrEqual(16);
    expect(pool.rect.max.y).toBeLessThanOrEqual(38);
    expect(floor("ground").cover.some((c) => c.id.startsWith("cover.fountain"))).toBe(true);
    expect(floor("ground").cover.filter((c) => c.id.startsWith("cover.lounger")).length).toBeGreaterThanOrEqual(4);
    expect(map.zones.some((z) => z.floor === "ground" && z.kind === "terrace")).toBe(true);
  });

  it("has the rooms a luxury villa needs, in sensible places", () => {
    for (const id of ["g.library", "g.drawing", "g.dining", "g.kitchen", "g.pantry", "g.cloak", "g.master", "g.study", "g.security", "g.generator"]) {
      expect(room("ground", id)).toBeDefined();
    }
    expect(room("ground", "g.foyer").rect.max.y).toBe(56); // front door on the north face
    expect(room("ground", "g.master").rect.min.x).toBe(28); // west wing
    for (const id of ["u.son", "u.wife", "u.daughter"]) expect(room("upper", id).tags).toContain("family");
    for (const id of ["u.guest.1", "u.guest.2", "u.guest.3", "u.office", "u.lounge", "u.bath"]) expect(room("upper", id)).toBeDefined();
  });

  it("has an L- or stepped shape for the outbuildings instead of plain boxes", () => {
    for (const id of ["grounds.guest-villa.wing", "grounds.staff.wing", "grounds.boathouse.store", "grounds.yacht.bow", "grounds.villa-west.wing", "grounds.villa-east.wing", "grounds.gate-lodge"]) {
      expect(room("grounds", id)).toBeDefined();
    }
  });
});

describe("charon.json: anchors from the layout doc", () => {
  it("has the five approach markers and the helipad landing zone", () => {
    const approach = (tag: string) => map.markers.find((m) => m.kind === "approach" && m.tags.includes(tag));
    expect(approach("approach:A")?.at).toEqual({ x: 69, y: 81 });
    expect(approach("approach:B")?.at).toEqual({ x: 0, y: 40 });
    expect(approach("approach:C")?.at).toEqual({ x: 48, y: 68 });
    expect(approach("approach:D")?.at).toEqual({ x: 88, y: -2 });
    expect(approach("approach:E")?.at).toEqual({ x: 18, y: 0 });
    expect(map.markers.find((m) => m.kind === "lz")?.floor).toBe("grounds");
  });

  it("puts every door on a wall line (inside a wall run, or in the gap cut for it), except on the roof", () => {
    for (const f of map.floors) {
      if (f.id === "roof") continue;
      for (const d of f.doors) {
        const half = d.width / 2;
        const onLine = f.walls.some((w) => {
          const vertical = w.a.x === w.b.x;
          const line = vertical ? w.a.x : w.a.y;
          const along = vertical ? d.at.y : d.at.x;
          const across = vertical ? d.at.x : d.at.y;
          const lo = Math.min(vertical ? w.a.y : w.a.x, vertical ? w.b.y : w.b.x) - half;
          const hi = Math.max(vertical ? w.a.y : w.a.x, vertical ? w.b.y : w.b.x) + half;
          return across === line && along >= lo && along <= hi;
        });
        expect(onLine, `door ${d.id} on floor ${f.id}`).toBe(true);
      }
    }
  });

  it("makes every wall of the ground-floor panic room reinforced and not destructible", () => {
    const panic = room("ground", "g.panic").rect;
    const onEdge = (w: { a: { x: number; y: number }; b: { x: number; y: number } }) => {
      const { min, max } = panic;
      const inX = (x: number) => x >= min.x && x <= max.x;
      const inY = (y: number) => y >= min.y && y <= max.y;
      const vertical = w.a.x === w.b.x && (w.a.x === min.x || w.a.x === max.x) && inY(w.a.y) && inY(w.b.y);
      const horizontal = w.a.y === w.b.y && (w.a.y === min.y || w.a.y === max.y) && inX(w.a.x) && inX(w.b.x);
      return vertical || horizontal;
    };
    const panicWalls = floor("ground").walls.filter(onEdge);
    expect(panicWalls.length).toBeGreaterThanOrEqual(4);
    for (const w of panicWalls) {
      expect(w.material, w.id).toBe("reinforced");
      expect(w.destructible, w.id).toBe(false);
    }
  });

  it("has the perimeter wall on the west, north and east sides with a 6 m gate gap", () => {
    const fixed = floor("grounds").walls.filter((w) => w.material === "perimeter");
    expect(fixed.length).toBeGreaterThanOrEqual(4);
    for (const w of fixed) expect(w).toMatchObject({ height: 3, thickness: 0.6 });
    const gate = floor("grounds").doors.find((d) => d.kind === "gate")!;
    expect(gate).toMatchObject({ at: { x: 69, y: 80 }, width: 6 });
  });

  it("has the panic room, shaft, tunnel and service stairs the validator and sim rely on", () => {
    const l = (id: string) => map.verticalLinks.find((x) => x.id === id)!;
    expect(l("link.stairs")).toMatchObject({ kind: "stairs", from: { floor: "ground", at: { x: 60, y: 30 } }, to: { floor: "upper", at: { x: 60, y: 30 } } });
    expect(l("link.roof")).toMatchObject({ kind: "roof-access", from: { floor: "upper" }, to: { floor: "roof" } });
    expect(l("link.shaft")).toMatchObject({ kind: "shaft", bidirectional: false, from: { floor: "upper", at: { x: 70, y: 26 } }, to: { floor: "ground", at: { x: 70, y: 26 } } });
    expect(l("link.shaft").restrictedTo).toEqual(["principal", "family"]);
    expect(l("link.tunnel")).toMatchObject({ kind: "shaft", from: { floor: "ground", at: { x: 66, y: 18 } }, to: { floor: "grounds", at: { x: 85, y: 0 } } });
    expect(l("link.cliff")).toMatchObject({ kind: "cliff-path", from: { at: { x: 18, y: -6 } }, to: { at: { x: 18, y: 0 } } });
  });

  it("puts the safe landing directly over the panic room", () => {
    expect(room("upper", "u.safe").rect).toEqual(room("ground", "g.panic").rect);
    expect(room("upper", "u.safe").tags).toContain("safe-landing");
  });

  it("spawns the layout's default guard numbers and tags every spawn for the sim", () => {
    const spawns = map.markers.filter((m) => m.kind === "spawn");
    const side = (m: { tags: string[] }) => m.tags.find((t) => t.startsWith("side:"));
    expect(spawns.filter((m) => m.tags.some((t) => t.startsWith("entity:def.hired."))).length).toBe(6);
    expect(spawns.filter((m) => m.tags.some((t) => t.startsWith("entity:def.vet."))).length).toBe(12);
    for (const m of spawns) {
      expect(m.tags.some((t) => t.startsWith("entity:")), m.id).toBe(true);
      expect(side(m), m.id).toBeDefined();
      expect(m.at, m.id).toBeDefined();
    }
    expect(new Set(spawns.map((m) => m.tags.find((t) => t.startsWith("entity:")))).size).toBe(spawns.length);
    expect(map.markers.filter((m) => m.tags.includes("force:reaction"))).toHaveLength(8);
  });

  it("starts each spawned guard inside the room or area its post names", () => {
    const inside = (rect: { min: { x: number; y: number }; max: { x: number; y: number } }, p: { x: number; y: number }) =>
      p.x >= rect.min.x && p.x <= rect.max.x && p.y >= rect.min.y && p.y <= rect.max.y;
    const post = (name: string) => map.markers.filter((m) => m.kind === "spawn" && m.tags.includes(`post:${name}`));
    for (const m of post("security-office")) expect(inside(room("ground", "g.security").rect, m.at!), m.id).toBe(true);
    for (const m of post("hall")) expect(inside(room("ground", "g.grand-hall").rect, m.at!), m.id).toBe(true);
    for (const m of post("roof-sniper").concat(post("roof-machine-gun"), post("roof-aa-missile"))) {
      expect(floor("roof").rooms.some((r) => inside(r.rect, m.at!)), m.id).toBe(true);
      expect(m.floor).toBe("roof");
    }
    const reaction = map.markers.filter((m) => m.tags.includes("force:reaction"));
    const villa = [room("grounds", "grounds.guest-villa"), room("grounds", "grounds.guest-villa.wing")];
    for (const m of reaction) expect(villa.some((v) => inside(v.rect, m.at!)), m.id).toBe(true);
  });

  it("has planters along the terrace as light, low cover", () => {
    const planters = floor("grounds").cover.filter((c) => c.id.startsWith("cover.planter"));
    expect(planters.length).toBeGreaterThanOrEqual(4);
    for (const p of planters) expect(p).toMatchObject({ type: "light" });
    for (const p of planters) expect(p.height).toBeLessThan(1.2);
  });

  it("has hedges as concealment cover in the gardens", () => {
    const hedges = floor("grounds").cover.filter((c) => c.id.startsWith("cover.hedge"));
    expect(hedges.length).toBeGreaterThanOrEqual(4);
    for (const h of hedges) expect(h.type).toBe("concealment");
  });

  it("has a roof parapet of cover that follows the U outline, and no derived roof walls", () => {
    expect(floor("roof").cover).toHaveLength(8);
    expect(floor("roof").walls).toEqual([]);
    const facings = floor("roof").cover.map((c) => c.facing);
    expect(facings).toEqual(expect.arrayContaining([0, 90, 180, 270]));
  });

  it("keeps every marker, zone and link inside the map bounds", () => {
    const { min, max } = map.bounds;
    const inside = (p: { x: number; y: number }) => p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
    for (const m of map.markers) {
      if (m.at) expect(inside(m.at), m.id).toBe(true);
      for (const p of m.path ?? []) expect(inside(p), m.id).toBe(true);
    }
    for (const z of map.zones) expect(inside(z.rect.min) && inside(z.rect.max), z.id).toBe(true);
    for (const l of map.verticalLinks) expect(inside(l.from.at) && inside(l.to.at), l.id).toBe(true);
    for (const f of map.floors) for (const r of f.rooms) expect(inside(r.rect.min) && inside(r.rect.max), r.id).toBe(true);
  });
});

describe("charon.json: nothing blocks the way", () => {
  type Pt = { x: number; y: number };
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const inside = (b: Box, p: Pt) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;
  const wallBox = (w: Floor["walls"][number]): Box => {
    const t = w.thickness / 2;
    return {
      x0: Math.min(w.a.x, w.b.x) - t,
      x1: Math.max(w.a.x, w.b.x) + t,
      y0: Math.min(w.a.y, w.b.y) - t,
      y1: Math.max(w.a.y, w.b.y) + t,
    };
  };
  const coverBox = (c: Floor["cover"][number]): Box => ({ x0: c.rect.min.x, y0: c.rect.min.y, x1: c.rect.max.x, y1: c.rect.max.y });
  /** Cover that stops a person walking through (hedges are concealment and can be walked through). */
  const blocking = (f: Floor): Box[] => f.cover.filter((c) => c.type !== "concealment").map(coverBox);

  it("keeps cover out of every doorway (the gap plus 0.6 m on each side)", () => {
    for (const f of map.floors) {
      if (f.id === "roof") continue;
      for (const d of f.doors) {
        const vertical = f.walls.some((w) => w.a.x === w.b.x && w.a.x === d.at.x && Math.min(w.a.y, w.b.y) - d.width / 2 <= d.at.y && Math.max(w.a.y, w.b.y) + d.width / 2 >= d.at.y);
        const half = d.width / 2;
        const doorway: Box = vertical
          ? { x0: d.at.x - 0.6, x1: d.at.x + 0.6, y0: d.at.y - half, y1: d.at.y + half }
          : { x0: d.at.x - half, x1: d.at.x + half, y0: d.at.y - 0.6, y1: d.at.y + 0.6 };
        for (const cover of f.cover) {
          expect(overlaps(doorway, coverBox(cover)), `cover ${cover.id} blocks door ${d.id} on floor ${f.id}`).toBe(false);
        }
      }
    }
  });

  it("never routes a patrol through a wall or solid cover", () => {
    for (const m of map.markers.filter((x) => x.kind === "patrol")) {
      const f = floor(m.floor);
      const solids = [...f.walls.map(wallBox), ...blocking(f)];
      const path = m.path ?? [];
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i]!;
        const b = path[i + 1]!;
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25);
        for (let s = 0; s <= steps; s++) {
          const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
          for (const box of solids) expect(inside(box, p), `${m.id} leg ${i} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`).toBe(false);
        }
      }
    }
  });

  it("never places a standing marker (spawn, post, point of interest) inside a wall or solid cover", () => {
    // approach markers (e.g. the breach point in the west wall) and landing zones are exempt on purpose
    for (const m of map.markers.filter((x) => ["spawn", "guard-post", "poi"].includes(x.kind) && x.at)) {
      const f = floor(m.floor);
      for (const box of [...f.walls.map(wallBox), ...blocking(f)]) expect(inside(box, m.at!), m.id).toBe(false);
    }
  });

  it("furnishes the upper floor with cover too (desk, sofa, beds)", () => {
    const ids = floor("upper").cover.map((c) => c.id);
    for (const id of ["cover.office-desk", "cover.lounge-sofa", "cover.son-bed", "cover.wife-bed", "cover.daughter-bed"]) {
      expect(ids, id).toContain(id);
    }
    expect(ids.filter((id) => id.startsWith("cover.guest-bed"))).toHaveLength(3);
  });
});
