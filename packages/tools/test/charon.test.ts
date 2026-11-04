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

describe("charon.json: basics", () => {
  it("parses against the schema", () => {
    expect(map.id).toBe("charon");
    expect(map.version).toBe(12);
    expect(map.floors.map((f) => f.id)).toEqual(["grounds", "ground", "upper", "roof", "lower", "shore", "hill"]);
    expect(map.floors.map((f) => f.elevation)).toEqual([0, 0, 4, 8, -4, -5, 4]);
  });

  it("has the expected room count per floor", () => {
    expect(floor("grounds").rooms).toHaveLength(10);
    expect(floor("ground").rooms).toHaveLength(21);
    expect(floor("upper").rooms).toHaveLength(18);
    expect(floor("roof").rooms).toHaveLength(14);
    expect(floor("lower").rooms).toHaveLength(9);
    expect(floor("shore").rooms).toHaveLength(5);
    expect(floor("hill").rooms).toHaveLength(4);
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


  it("loads in the headless harness", async () => {
    const { loadMap } = await import("../src/headlessCore");
    expect(loadMap("charon").id).toBe("charon");
  });
});

describe("charon.json: the zigzag villa", () => {
  it("has the rooms a luxury villa needs, in sensible places", () => {
    for (const id of ["g.library", "g.wine-room", "g.drawing", "g.dining", "g.kitchen", "g.service", "g.cloak", "g.master", "g.study", "g.security", "g.soc", "g.living", "g.lounge"]) {
      expect(room("ground", id)).toBeDefined();
    }
    expect(room("ground", "g.foyer").rect.max.y).toBe(56); // front door on the north face
    for (const id of ["u.son", "u.wife", "u.daughter"]) expect(room("upper", id).tags).toContain("family");
    for (const id of ["u.guest", "u.spa", "u.terrace.c", "u.sky-lounge", "u.office", "u.cinema", "u.bath"]) expect(room("upper", id)).toBeDefined();
  });

  it("has a grand staircase: two walkable floating flights to the gallery, with no solid block and no rail standing on the hall floor", () => {
    for (const id of ["link.grand-stairs.west", "link.grand-stairs.east"]) {
      const link = map.verticalLinks.find((l) => l.id === id)!;
      expect(link).toMatchObject({ kind: "stairs", bidirectional: true, from: { floor: "ground" }, to: { floor: "upper" } });
      expect(link.restrictedTo).toBeUndefined();
    }
    expect(floor("ground").cover.filter((c) => c.id.startsWith("cover.grand-stair"))).toEqual([]); // the glass balustrade rides the flight (greybox), not the floor
  });

  it("has an L- or stepped shape for the outbuildings instead of plain boxes", () => {
    for (const [fl, id] of [["grounds", "grounds.guest-villa.wing"], ["grounds", "grounds.staff.wing"], ["shore", "grounds.boathouse.store"], ["shore", "grounds.yacht.bow"], ["hill", "grounds.villa-west.wing"], ["hill", "grounds.villa-east.wing"], ["grounds", "grounds.gate-lodge"]] as const) {
      expect(room(fl, id)).toBeDefined();
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
    expect(l("link.stairs")).toMatchObject({ kind: "stairs", from: { floor: "ground", at: { x: 60, y: 36 } }, to: { floor: "upper", at: { x: 60, y: 36 } } });
    expect(l("link.roof")).toMatchObject({ kind: "roof-access", from: { floor: "upper" }, to: { floor: "roof" } });
    expect(l("link.shaft")).toMatchObject({ kind: "shaft", bidirectional: false, from: { floor: "upper", at: { x: 73, y: 36 } }, to: { floor: "ground", at: { x: 73, y: 36 } } });
    expect(l("link.shaft").restrictedTo).toEqual(["principal", "family"]);
    expect(l("link.tunnel")).toMatchObject({ kind: "shaft", from: { floor: "ground", at: { x: 68, y: 34 } }, to: { floor: "shore", at: { x: 85, y: 0 } } });
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

  it("has hedges as concealment cover in the gardens", () => {
    const hedges = floor("grounds").cover.filter((c) => c.id.startsWith("cover.hedge"));
    expect(hedges.length).toBeGreaterThanOrEqual(4);
    for (const h of hedges) expect(h.type).toBe("concealment");
  });

  it("has a roof parapet of cover around the two tall bars", () => {
    const parapet = floor("roof").cover.filter((c) => c.id.startsWith("cover.parapet"));
    expect(parapet).toHaveLength(13); // the north strip has a gap where the roof ladder comes over
    const facings = parapet.map((c) => c.facing);
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

  it("keeps every hatch, shaft and tunnel end clear of solid cover (stairs end inside their own stair body)", () => {
    for (const l of map.verticalLinks.filter((x) => x.kind !== "stairs")) {
      for (const end of [l.from, l.to]) {
        for (const box of blocking(floor(end.floor))) expect(inside(box, end.at), `${l.id} on ${end.floor}`).toBe(false);
      }
    }
  });

  it("furnishes the upper floor with cover too (desk, sofa, beds)", () => {
    const ids = floor("upper").cover.map((c) => c.id);
    for (const id of ["cover.office-desk", "cover.cinema-seats", "cover.son-bed", "cover.wife-bed", "cover.daughter-bed", "cover.guest-bed", "cover.spa-tub", "cover.terrace-lounger.1"]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("charon.json: roof and gardens", () => {
  const ids = (floorId: string, prefix: string) => floor(floorId).cover.filter((c) => c.id.startsWith(prefix));
  const within = (z: { rect: { min: { x: number; y: number }; max: { x: number; y: number } } }, outer: { min: { x: number; y: number }; max: { x: number; y: number } }) =>
    z.rect.min.x >= outer.min.x && z.rect.max.x <= outer.max.x && z.rect.min.y >= outer.min.y && z.rect.max.y <= outer.max.y;

  it("gives the roof a sun deck with a plunge pool, a pergola and loungers", () => {
    const deck = map.zones.find((z) => z.id === "zone.roof-deck")!;
    const pool = map.zones.find((z) => z.id === "zone.roof-pool")!;
    expect(deck).toMatchObject({ floor: "roof", kind: "terrace" });
    expect(pool).toMatchObject({ floor: "roof", kind: "pool" });
    expect(area(deck.rect)).toBeLessThanOrEqual(200);
    expect(within(deck, room("roof", "r.deck.b.s").rect)).toBe(true);
    expect(within(pool, deck.rect)).toBe(true);
    expect(ids("roof", "cover.pergola")).toHaveLength(4);
    expect(ids("roof", "cover.roof-lounger").length).toBeGreaterThanOrEqual(2);
  });

  it("gives deck B a mechanical zone: HVAC units, solar rows, a dish and a hatch housing", () => {
    const deckB = room("roof", "r.deck.b").rect;
    expect(ids("roof", "cover.hvac").length).toBeGreaterThanOrEqual(2);
    expect(ids("roof", "cover.solar").length).toBeGreaterThanOrEqual(2);
    expect(ids("roof", "cover.dish").length).toBeGreaterThanOrEqual(1);
    expect(ids("roof", "cover.roof-access-housing")).toHaveLength(1);
    for (const c of [...ids("roof", "cover.hvac"), ...ids("roof", "cover.solar")]) expect(within(c, deckB), c.id).toBe(true);
    for (const c of ids("roof", "cover.dish")) expect(within(c, room("roof", "r.deck.b.ee").rect), c.id).toBe(true);
    for (const c of ids("roof", "cover.hvac")) expect(c.type).toBe("heavy");
  });

  it("gives the main roof chimneys, a comm mast in the radar tower, and an anti-aircraft site: launcher behind sandbags", () => {
    const mast = ids("roof", "cover.mast")[0]!;
    expect(mast.height).toBeGreaterThanOrEqual(5);
    expect(within(mast, room("roof", "r.radar-tower").rect)).toBe(true);
    expect(ids("roof", "cover.chimney").length).toBeGreaterThanOrEqual(2);
    const launcher = ids("roof", "cover.aa-launcher");
    expect(launcher).toHaveLength(1);
    expect(within(launcher[0]!, room("roof", "r.deck.a").rect)).toBe(true);
    expect(ids("roof", "cover.aa-sandbag").length).toBeGreaterThanOrEqual(3);
    for (const c of ids("roof", "cover.aa-sandbag")) expect(c.type).toBe("light");
  });

  it("lays out the east garden formally: crossing gravel paths, a fountain plaza, hedge rooms, topiary, palms and a gazebo", () => {
    const garden = map.zones.find((z) => z.id === "zone.garden-east")!.rect;
    const paths = map.zones.filter((z) => z.id.startsWith("zone.garden-path") || z.id === "zone.garden-plaza");
    expect(paths.length).toBeGreaterThanOrEqual(3);
    for (const z of paths) expect(z).toMatchObject({ floor: "grounds", kind: "terrace" });
    for (const z of paths) expect(within(z, garden), z.id).toBe(true);
    expect(ids("grounds", "cover.garden-fountain")).toHaveLength(1);
    const hedges = ids("grounds", "cover.hedge").filter((h) => within(h, garden));
    expect(hedges.length).toBeGreaterThanOrEqual(3);
    for (const h of hedges) expect(h).toMatchObject({ type: "concealment" });
    expect(ids("grounds", "cover.topiary").length).toBeGreaterThanOrEqual(2);
    expect(ids("grounds", "cover.palm").length).toBeGreaterThanOrEqual(4);
    expect(ids("grounds", "cover.gazebo-column")).toHaveLength(4);
    expect(map.zones.some((z) => z.id === "zone.gazebo" && z.kind === "terrace")).toBe(true);
  });

  it("keeps a grove of staggered trees and an ornamental pond west of the house", () => {
    const trees = ids("grounds", "cover.tree");
    expect(trees.length).toBeGreaterThanOrEqual(6);
    for (const t of trees) expect(t.type).toBe("concealment");
    expect(new Set(trees.map((t) => t.rect.min.x)).size).toBeGreaterThanOrEqual(4);
    expect(map.zones.find((z) => z.id === "zone.grove-pond")).toMatchObject({ floor: "grounds", kind: "pool" });
  });

  it("no longer uses the old straight hedge stripes", () => {
    const stripes = ids("grounds", "cover.hedge").filter((h) => h.rect.max.x - h.rect.min.x >= 12 && h.rect.max.y - h.rect.min.y < 1.5);
    expect(stripes).toEqual([]);
  });
});

describe("charon.json: the fortress terrace (roof)", () => {
  const roofRooms = () => floor("roof").rooms;
  const tagged = (tag: string) => roofRooms().filter((r) => r.tags.includes(tag));
  const wallsOf = (id: string) => {
    const r = room("roof", id).rect;
    const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
    return floor("roof").walls.filter((w) => {
      const onX = w.a.x === w.b.x && (w.a.x === r.min.x || w.a.x === r.max.x) && overlap(Math.min(w.a.y, w.b.y), Math.max(w.a.y, w.b.y), r.min.y, r.max.y);
      const onY = w.a.y === w.b.y && (w.a.y === r.min.y || w.a.y === r.max.y) && overlap(Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x), r.min.x, r.max.x);
      return onX || onY;
    });
  };

  it("has four bastions, a radar tower and open decks", () => {
    expect(tagged("bastion")).toHaveLength(4);
    expect(tagged("radar-tower")).toHaveLength(1);
    expect(tagged("deck").length).toBeGreaterThanOrEqual(5);
    // bastions stand at the outer corners of the two tall bars
    expect(tagged("bastion").map((r) => r.id).sort()).toEqual(["r.bastion.ne", "r.bastion.nw", "r.bastion.se", "r.bastion.sw"]);
  });

  it("walls the structures and leaves the decks open (a parapet of cover edges them)", () => {
    for (const r of [...tagged("bastion"), ...tagged("radar-tower")]) expect(wallsOf(r.id).length, r.id).toBeGreaterThan(0);
    for (const r of tagged("deck")) {
      // a deck's own edges carry walls only where a structure stands beside it
      for (const w of wallsOf(r.id)) {
        const touchesStructure = roofRooms().some((o) => o.id !== r.id && o.tags.includes("structure") && wallsOf(o.id).includes(w));
        expect(touchesStructure, r.id + " " + w.id).toBe(true);
      }
    }
  });

  it("makes bastions and the radar tower hard to breach (reinforced, not destructible)", () => {
    for (const r of [...tagged("bastion"), ...tagged("radar-tower")]) {
      for (const w of wallsOf(r.id)) {
        expect(w.material, w.id).toBe("reinforced");
        expect(w.destructible, w.id).toBe(false);
      }
    }
  });

  it("puts the gun posts in the bastions, and the anti-aircraft team on the main deck", () => {
    const at = (id: string) => map.markers.find((m) => m.id === id)!.at!;
    const inside = (r: Room, p: { x: number; y: number }) => p.x >= r.rect.min.x && p.x <= r.rect.max.x && p.y >= r.rect.min.y && p.y <= r.rect.max.y;
    expect(inside(room("roof", "r.bastion.nw"), at("m.spawn.vet.1"))).toBe(true);
    expect(inside(room("roof", "r.bastion.ne"), at("m.spawn.vet.2"))).toBe(true);
    expect(inside(room("roof", "r.bastion.sw"), at("m.spawn.vet.3"))).toBe(true);
    expect(inside(room("roof", "r.deck.a"), at("m.spawn.vet.4"))).toBe(true);
  });

  it("gives every bastion and the radar tower slit windows (no shutters, wall-mounted firing slits)", () => {
    for (const r of [...tagged("bastion"), ...tagged("radar-tower")]) {
      const slits = floor("roof").windows.filter((w) => w.between.includes(r.id));
      expect(slits.length, r.id).toBeGreaterThanOrEqual(2);
      for (const w of slits) {
        expect(w.width, w.id).toBeLessThanOrEqual(0.5);
        expect(w.shutter, w.id).toBe(false);
      }
    }
  });

  it("has three ways onto the roof: the east hatch, a west hatch and a ladder from the north balcony", () => {
    const roofLinks = map.verticalLinks.filter((l) => l.kind === "roof-access");
    expect(roofLinks.map((l) => l.id).sort()).toEqual(["link.roof", "link.roof-ladder", "link.roof.west"]);
    const ladder = roofLinks.find((l) => l.id === "link.roof-ladder")!;
    expect(room("upper", "u.balcony.n").tags).toContain("exterior");
    expect(ladder.from.at.y).toBeGreaterThan(56); // starts out on the balcony
    // the ladder tops out through a gap in the bastion's north wall, not through solid wall
    const gap = floor("roof").doors.find((d) => d.id === "d.r.nw-ladder")!;
    expect(gap.between).toEqual(["r.bastion.nw", "outside"]);
    expect(Math.abs(gap.at.x - ladder.to.at.x)).toBeLessThanOrEqual(gap.width / 2);
    const wallAcross = floor("roof").walls.filter((w) => w.a.y === 56 && w.b.y === 56 && Math.min(w.a.x, w.b.x) < ladder.to.at.x && Math.max(w.a.x, w.b.x) > ladder.to.at.x);
    expect(wallAcross).toEqual([]);
    const west = roofLinks.find((l) => l.id === "link.roof.west")!;
    expect(west.from.at).toEqual(west.to.at);
    expect(west.to.at.x).toBeLessThan(50);
  });
});

describe("charon.json: security operations center", () => {
  const soc = () => room("ground", "g.soc");

  it("has a security-center room next to the panic room, with its own console and server racks", () => {
    expect(soc().tags).toEqual(expect.arrayContaining(["security-center", "smart-hub"]));
    const panic = room("ground", "g.panic").rect;
    expect(soc().rect.max.y).toBe(panic.min.y); // shares the panic room's south wall
    expect(soc().rect.min.x).toBe(panic.min.x);
    expect(floor("ground").cover.some((c) => c.id === "cover.soc-console")).toBe(true);
    expect(floor("ground").cover.some((c) => c.id === "cover.soc-racks")).toBe(true);
  });

  it("is reached from the master bath through a locked door, with armored slit windows", () => {
    const door = floor("ground").doors.find((d) => d.between.includes("g.soc") && d.between.includes("g.master-bath"))!;
    expect(door.state).toBe("locked");
    const slits = floor("ground").windows.filter((w) => w.between.includes("g.soc"));
    expect(slits.length).toBeGreaterThanOrEqual(1);
    for (const w of slits) expect(w.width).toBeLessThanOrEqual(0.5);
  });

  it("keeps the guard room at the front door, with an armory rack, separate from the SOC", () => {
    expect(room("ground", "g.security").tags).toContain("guard-post");
    expect(room("ground", "g.security").tags).not.toContain("security-center");
    expect(floor("ground").cover.some((c) => c.id === "cover.armory-rack")).toBe(true);
    expect(map.markers.some((m) => m.tags.includes("poi:armory"))).toBe(true);
  });
});

describe("charon.json: windows", () => {
  const all = () => map.floors.flatMap((f) => f.windows.map((w) => ({ f, w })));

  it("has about forty windows, in armored glass and narrow slits", () => {
    expect(all().length).toBeGreaterThanOrEqual(35);
    expect(all().some(({ w }) => w.width <= 0.5)).toBe(true);
    expect(all().some(({ w }) => w.width > 1)).toBe(true);
  });

  it("makes every window blast-rated, and every glass window carry a steel shutter", () => {
    for (const { w } of all()) {
      expect(w.blastRated, w.id).toBe(true);
      if (w.width > 0.5) expect(w.shutter, w.id).toBe(true);
    }
  });

  it("keeps the panic room and the safe landing windowless, and the wine room to slits", () => {
    for (const { w } of all()) {
      expect(w.between, w.id).not.toContain("g.panic");
      expect(w.between, w.id).not.toContain("u.safe");
    }
    for (const { w } of all().filter(({ w }) => w.between.includes("g.wine-room"))) expect(w.width).toBeLessThanOrEqual(0.5);
  });
});

describe("charon.json: entries", () => {
  const door = (floorId: string, id: string) => floor(floorId).doors.find((d) => d.id === id)!;

  it("has no external emergency stair (removed in v4: it spoiled the front of the villa)", () => {
    expect(map.verticalLinks.some((l) => l.id === "link.fire-stair")).toBe(false);
    expect(floor("upper").rooms.some((r) => r.id === "u.fire-escape")).toBe(false);
    expect(floor("upper").doors.some((d) => d.id === "d.u.gym-fire-escape")).toBe(false);
    // no stairs join the upper floor to the outdoors
    expect(map.verticalLinks.filter((l) => l.kind === "stairs" && [l.from.floor, l.to.floor].includes("upper")).every((l) => [l.from.floor, l.to.floor].every((f) => f === "ground" || f === "upper"))).toBe(true);
  });

  it("has a staff-only gate in the west perimeter wall and a staff entrance into the service room", () => {
    const gate = door("grounds", "d.staff-gate");
    expect(gate).toMatchObject({ kind: "gate", state: "locked", at: { x: 0, y: 64 } });
    expect(door("ground", "d.g.service-south").between).toEqual(["g.service", "outside"]);
    expect(room("ground", "g.service").tags).toContain("service");
  });

  it("has a covered walkway and an interior door joining the garage to the house", () => {
    expect(room("ground", "g.garage-link").tags).toContain("walkway");
    expect(door("ground", "d.g.dining-garage-link").between).toEqual(["g.dining", "g.garage-link"]);
    expect(door("ground", "d.g.garage-link-garage").between).toContain("g.garage-link");
  });
});

describe("charon.json: extras", () => {
  it("has a pool house with an outdoor kitchen, and a power house", () => {
    expect(room("grounds", "grounds.pool-house")).toBeDefined();
    expect(floor("grounds").cover.filter((c) => c.id.startsWith("cover.outdoor-kitchen")).length).toBeGreaterThanOrEqual(2);
    expect(room("grounds", "grounds.power-house").tags).toContain("power-house");
  });

  it("has luxury interior rooms: library, wine room, gym, spa and a screening room", () => {
    for (const id of ["g.library", "g.wine-room"]) expect(room("ground", id)).toBeDefined();
    for (const id of ["u.spa", "u.cinema"]) expect(room("upper", id)).toBeDefined();
    expect(room("lower", "l.gym")).toBeDefined();
    expect(floor("ground").cover.some((c) => c.id === "cover.library-shelves")).toBe(true);
  });
});

describe("charon.json: smart home", () => {
  const withTag = (tag: string) => map.markers.filter((m) => m.tags.includes(tag));
  const inRoom = (r: Room, p: { x: number; y: number }) => p.x > r.rect.min.x && p.x < r.rect.max.x && p.y > r.rect.min.y && p.y < r.rect.max.y;

  it("has a primary hub in the security center and a backup hub in the power house", () => {
    const hubs = withTag("smart:hub");
    expect(hubs).toHaveLength(2);
    const primary = hubs.find((m) => m.tags.includes("hub:primary"))!;
    expect(primary.floor).toBe("ground");
    expect(inRoom(room("ground", "g.soc"), primary.at!)).toBe(true);
    const backup = hubs.find((m) => m.tags.includes("hub:backup"))!;
    expect(inRoom(room("grounds", "grounds.power-house"), backup.at!)).toBe(true);
  });

  it("has cameras covering the gate, approaches and key interior spaces, all feeding the SOC", () => {
    const cams = withTag("smart:camera");
    expect(cams.length).toBeGreaterThanOrEqual(12);
    const covers = cams.flatMap((m) => m.tags.filter((t) => t.startsWith("covers:")).map((t) => t.slice(7)));
    for (const name of ["gate", "helipad", "marina", "foyer", "grand-hall", "roof"]) expect(covers, name).toContain(name);
    for (const m of [...cams, ...withTag("smart:motion"), ...withTag("smart:floodlight")]) expect(m.tags, m.id).toContain("feeds:g.soc");
  });

  it("has floodlights, motion sensors and smart locks on doors that exist", () => {
    expect(withTag("smart:floodlight").length).toBeGreaterThanOrEqual(4);
    expect(withTag("smart:motion").length).toBeGreaterThanOrEqual(3);
    const doors = new Set(map.floors.flatMap((f) => f.doors.map((d) => d.id)));
    const locks = withTag("smart:lock");
    expect(locks.length).toBeGreaterThanOrEqual(3);
    for (const m of locks) {
      const ref = m.tags.find((t) => t.startsWith("door:"))!.slice(5);
      expect(doors.has(ref), m.id).toBe(true);
    }
  });
});
