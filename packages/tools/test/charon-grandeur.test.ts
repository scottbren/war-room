import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Floor, Room } from "@war-room/content";

const file = fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url));
const map = MapFile.parse(JSON.parse(readFileSync(file, "utf8")));
const floor = (id: string): Floor => map.floors.find((f) => f.id === id)!;
const room = (floorId: string, id: string): Room => {
  const r = floor(floorId).rooms.find((x) => x.id === id);
  if (!r) throw new Error(`no room ${id} on ${floorId}`);
  return r;
};
const cover = (floorId: string, prefix: string) => floor(floorId).cover.filter((c) => c.id.startsWith(prefix));
const zone = (id: string) => map.zones.find((z) => z.id === id);
type Rect = { min: { x: number; y: number }; max: { x: number; y: number } };
const area = (r: Rect) => (r.max.x - r.min.x) * (r.max.y - r.min.y);
const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)) * Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y));
const overlaps = (a: Rect, b: Rect) => overlapArea(a, b) > 0;
const rectOf = (x0: number, y0: number, x1: number, y1: number): Rect => ({ min: { x: x0, y: y0 }, max: { x: x1, y: y1 } });
const inRoom = (r: Room, p: { x: number; y: number }) => p.x >= r.rect.min.x && p.x <= r.rect.max.x && p.y >= r.rect.min.y && p.y <= r.rect.max.y;

// The three bars of the zigzag, each 42 x 15 m: A (entrance, north), B (private, slid east), C (living, slid west).
const BAR_A = rectOf(18, 41, 60, 56);
const BAR_B = rectOf(40, 26, 82, 41);
const BAR_C = rectOf(12, 11, 54, 26);

describe("charon.json v6: the zigzag of three bars", () => {
  it("tiles each ground-floor bar completely with rooms (no gaps, no strays)", () => {
    const rooms = floor("ground").rooms.filter((r) => !r.tags.includes("walkway") && !r.tags.includes("portico"));
    for (const [name, bar] of [["A", BAR_A], ["B", BAR_B], ["C", BAR_C]] as const) {
      const inside = rooms.filter((r) => overlaps(r.rect, bar));
      for (const r of inside) expect(overlapArea(r.rect, bar), `${r.id} sticks out of bar ${name}`).toBe(area(r.rect));
      expect(inside.reduce((s, r) => s + area(r.rect), 0), `bar ${name}`).toBe(area(bar));
    }
    expect(rooms.reduce((s, r) => s + area(r.rect), 0)).toBe(3 * 42 * 15); // and nothing outside the bars
  });

  it("is a staircase of offset bars, not a ring: the bars slide 20 m and 28 m and leave open notches", () => {
    expect(BAR_B.min.x - BAR_A.min.x).toBe(22);
    expect(BAR_A.min.x - BAR_C.min.x).toBe(6);
    expect(BAR_B.min.x - BAR_C.min.x).toBe(28);
    // each bar overlaps the next along only part of its length (they connect through cores)
    expect(Math.min(BAR_A.max.x, BAR_B.max.x) - Math.max(BAR_A.min.x, BAR_B.min.x)).toBe(20);
    expect(Math.min(BAR_B.max.x, BAR_C.max.x) - Math.max(BAR_B.min.x, BAR_C.min.x)).toBe(14);
    // the garden notch (west of B, between A and C) and the pool notch (east of C, south of B) hold no ground-floor room
    const notches = [rectOf(12, 26, 40, 41), rectOf(54, 11, 82, 26)];
    for (const n of notches) for (const r of floor("ground").rooms) expect(overlaps(n, r.rect), r.id).toBe(false);
  });

  it("has no courtyard or loggias around a ring any more", () => {
    const ids = floor("ground").rooms.map((r) => r.id);
    for (const gone of ["g.courtyard", "g.loggia.w", "g.loggia.e"]) expect(ids).not.toContain(gone);
  });

  it("is bigger than before: about 1,890 m2 on the ground floor", () => {
    const interior = floor("ground").rooms.filter((r) => r.tags.includes("interior")).reduce((s, r) => s + area(r.rect), 0);
    expect(interior).toBeGreaterThanOrEqual(1800);
  });

  it("has a long open-plan living room whose glass wall faces the pool notch", () => {
    const living = room("ground", "g.living");
    expect(area(living.rect)).toBeGreaterThanOrEqual(400);
    const door = floor("ground").doors.find((d) => d.between.includes("g.living") && d.between.includes("outside") && d.at.x === living.rect.max.x)!;
    expect(door.kind).toBe("glass");
    expect(door.width).toBeGreaterThanOrEqual(3);
  });
});

describe("charon.json v6: stacking and heights", () => {
  it("keeps the panic room, the SOC and the safe landing stacked as the sim and validator expect", () => {
    expect(room("upper", "u.safe").rect).toEqual(room("ground", "g.panic").rect);
    const panic = room("ground", "g.panic").rect, soc = room("ground", "g.soc").rect;
    expect(soc.max.y).toBe(panic.min.y);
    expect([soc.min.x, soc.max.x]).toEqual([panic.min.x, panic.max.x]);
    expect(floor("ground").doors.find((d) => d.between.includes("g.panic"))!.kind).toBe("blast");
  });

  it("makes bar C one storey: its roof is the upper-level terrace, with no interior room above it", () => {
    for (const r of floor("upper").rooms) {
      if (overlaps(r.rect, BAR_C) && !overlaps(r.rect, BAR_B)) expect(r.tags, r.id).toContain("exterior");
    }
    expect(room("upper", "u.terrace.c").tags).toEqual(expect.arrayContaining(["exterior", "terrace"]));
  });

  it("makes bars A and B two storeys with the roof above them", () => {
    for (const bar of [BAR_A, BAR_B]) {
      const upperInterior = floor("upper").rooms.filter((r) => r.tags.includes("interior") && overlaps(r.rect, bar));
      expect(upperInterior.length).toBeGreaterThanOrEqual(5);
    }
    for (const r of floor("roof").rooms) expect(overlaps(r.rect, BAR_C), r.id + " over the low bar").toBe(false);
  });

  it("has a double-height grand hall with a void above it", () => {
    const hall = room("ground", "g.grand-hall");
    expect(hall.ceiling).toBe(8);
    expect(room("upper", "u.void").rect).toEqual(hall.rect);
    expect(floor("upper").openings.some((o) => o.kind === "gallery-void" && o.below === "ground")).toBe(true);
  });

  it("has two grand-stair flights on either side of the open hall, each landing on the gallery", () => {
    const flights = map.verticalLinks.filter((l) => l.id.startsWith("link.grand-stairs."));
    expect(flights.length).toBe(2);
    const hall = room("ground", "g.grand-hall"), gallery = room("upper", "u.gallery");
    for (const l of flights) {
      expect(l.kind).toBe("stairs");
      expect(inRoom(hall, l.from.at), l.id).toBe(true);
      expect(inRoom(gallery, l.to.at), l.id).toBe(true);
      expect(Math.abs(l.to.at.y - l.from.at.y), l.id).toBeGreaterThanOrEqual(8.5); // a walkable run for 4 m of rise
    }
    const xs = flights.map((l) => l.from.at.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(10); // the middle of the hall stays open
  });

  it("keeps the foot of each flight open to the hall and no door under a flight (a path must not pass through the steps)", () => {
    const flights = map.verticalLinks.filter((l) => l.id.startsWith("link.grand-stairs."));
    const hall = room("ground", "g.grand-hall");
    const FOOT_OPEN = 2; // metres of the run, from the foot, that stay open to the hall (the first steps are under 1 m high)
    for (const l of flights) {
      const lane = { x0: l.from.at.x - 1.5, x1: l.from.at.x + 1.5, y0: l.from.at.y, y1: l.to.at.y };
      for (const d of floor("ground").doors) {
        // A door in a vertical wall (x = the hall's side) opens along y; one in a horizontal wall opens along x.
        const vertical = d.at.x === hall.rect.min.x || d.at.x === hall.rect.max.x;
        const body = vertical
          ? d.at.x > lane.x0 - 1 && d.at.x < lane.x1 + 1 && d.at.y + d.width / 2 > lane.y0 + FOOT_OPEN && d.at.y - d.width / 2 < lane.y1
          : d.at.x + d.width / 2 > lane.x0 && d.at.x - d.width / 2 < lane.x1 && d.at.y > lane.y0 + FOOT_OPEN && d.at.y <= lane.y1 + 0.2;
        expect(body, `${d.id} opens onto the steps of ${l.id}`).toBe(false);
      }
      for (const c of floor("ground").cover.filter((x) => x.id.startsWith("cover.grand-stair-rail"))) {
        const alongFlight = c.rect.max.x > lane.x0 - 0.5 && c.rect.min.x < lane.x1 + 0.5;
        if (alongFlight) expect(c.rect.min.y, `${c.id} blocks the foot`).toBeGreaterThanOrEqual(l.from.at.y - 0.2 + FOOT_OPEN);
      }
    }
  });

  it("has a sky lounge cantilevered 5 m out over the pool notch (nothing under it on the ground floor)", () => {
    const lounge = room("upper", "u.sky-lounge");
    expect(lounge.tags).toContain("interior");
    const cantilever = rectOf(lounge.rect.min.x, lounge.rect.min.y, lounge.rect.max.x, BAR_B.min.y);
    // Believable without columns: residential cantilevers run 3-5 m (Scott, 2026-11-04: 9 m "too much").
    const depth = BAR_B.min.y - lounge.rect.min.y;
    expect(depth).toBeGreaterThanOrEqual(4);
    expect(depth).toBeLessThanOrEqual(5);
    expect(area(cantilever)).toBeGreaterThanOrEqual(50);
    for (const r of floor("ground").rooms) expect(overlaps(cantilever, r.rect), r.id).toBe(false);
    const pool = zone("zone.pool")!;
    expect(pool.kind).toBe("pool");
    expect(overlaps(cantilever, pool.rect)).toBe(true); // the lounge hangs over the water
    expect(floor("upper").doors.some((d) => d.between.includes("u.sky-lounge") && d.kind === "glass")).toBe(true);
    expect(floor("upper").windows.filter((w) => w.between.includes("u.sky-lounge")).every((w) => w.shutter)).toBe(true);
  });
});

describe("charon.json v6: the fortress roof on the two tall bars", () => {
  const roofRooms = () => floor("roof").rooms;
  it("has bastions at the corners of A and B, the radar tower on A, and a deck over the cantilever", () => {
    const b = roofRooms().filter((r) => r.tags.includes("bastion"));
    expect(b.length).toBe(4);
    for (const r of b) expect(overlaps(r.rect, BAR_A) || overlaps(r.rect, BAR_B), r.id).toBe(true);
    const tower = roofRooms().find((r) => r.tags.includes("radar-tower"))!;
    expect(overlaps(tower.rect, BAR_A)).toBe(true);
    expect(tower.ceiling).toBeGreaterThanOrEqual(7);
    expect(roofRooms().some((r) => r.tags.includes("deck") && r.rect.min.y < BAR_B.min.y && overlaps(r.rect, room("upper", "u.sky-lounge").rect))).toBe(true);
  });

  it("has three ways onto the roof, every end inside a room", () => {
    const links = map.verticalLinks.filter((l) => l.kind === "roof-access");
    expect(links.map((l) => l.id).sort()).toEqual(["link.roof", "link.roof-ladder", "link.roof.west"]);
    for (const l of links) {
      const top = l.to.floor === "roof" ? l.to : l.from;
      expect(roofRooms().some((r) => inRoom(r, top.at)), l.id).toBe(true);
    }
  });

  it("puts the gun posts in the bastions and the anti-aircraft team on the main deck", () => {
    const at = (id: string) => map.markers.find((m) => m.id === id)!.at!;
    for (const [id, tag] of [["m.spawn.vet.1", "bastion"], ["m.spawn.vet.2", "bastion"], ["m.spawn.vet.3", "bastion"]] as const) {
      expect(roofRooms().some((r) => r.tags.includes(tag) && inRoom(r, at(id))), id).toBe(true);
    }
    expect(inRoom(room("roof", "r.deck.a"), at("m.spawn.vet.4"))).toBe(true);
  });
});

describe("charon.json v6: the entrance and the pool", () => {
  it("keeps the front door on the north face under a flat canopy on two piers", () => {
    const main = floor("ground").doors.find((d) => d.id === "d.g.main")!;
    expect(main.between).toEqual(["g.foyer", "g.portico"]);
    expect(main.at.y).toBe(56);
    const portico = room("ground", "g.portico");
    expect((portico.rect.min.x + portico.rect.max.x) / 2).toBe(main.at.x);
    expect(cover("ground", "cover.canopy-pier").length).toBe(2);
    const lz = map.markers.find((m) => m.id === "m.lz.helipad")!.at!;
    for (const c of cover("grounds", "cover.forecourt")) expect(lz.x >= c.rect.min.x && lz.x <= c.rect.max.x && lz.y >= c.rect.min.y && lz.y <= c.rect.max.y, c.id).toBe(false);
  });

  it("has a long pool in the notch, a garden in the other notch, and a roof sun deck with a plunge pool", () => {
    expect(zone("zone.pool")!.floor).toBe("grounds");
    expect(zone("zone.garden-notch")!.kind).toBe("garden");
    expect(zone("zone.roof-pool")!.floor).toBe("roof");
  });

  it("clears the lawn of trees and hedges where the new bars stand", () => {
    for (const c of floor("grounds").cover) {
      for (const [name, bar] of [["A", BAR_A], ["B", BAR_B], ["C", BAR_C]] as const) {
        if (c.id.startsWith("cover.tree") || c.id.startsWith("cover.hedge") || c.id.startsWith("cover.topiary") || c.id.startsWith("cover.palm")) {
          expect(overlaps(c.rect, bar), `${c.id} inside bar ${name}`).toBe(false);
        }
      }
    }
  });

  it("keeps the new cameras on the front spaces, all feeding the SOC", () => {
    const cams = map.markers.filter((m) => m.tags.includes("smart:camera"));
    for (const name of ["portico", "forecourt", "pool"]) {
      const cam = cams.find((m) => m.tags.includes("covers:" + name));
      expect(cam, name).toBeDefined();
      expect(cam!.tags).toContain("feeds:g.soc");
    }
  });
});

describe("charon.json v6: the basement (lower)", () => {
  it("is a floor at -4 m under bars A and B with gym, spa, cellar, armory, vault and plant rooms", () => {
    const lower = floor("lower");
    expect(lower.elevation).toBe(-4);
    expect(lower.rooms.length).toBe(9);
    for (const r of lower.rooms) {
      expect(r.tags, r.id).toContain("interior");
      expect(overlaps(r.rect, BAR_A) || overlaps(r.rect, BAR_B), r.id).toBe(true);
      expect(overlaps(r.rect, BAR_C), r.id + " under the low bar").toBe(false);
    }
    for (const id of ["l.gym", "l.cellar", "l.spa", "l.armory", "l.vault", "l.mech", "l.staff"]) expect(room("lower", id)).toBeDefined();
    expect(lower.windows).toEqual([]);
  });

  it("is reached by two stair flights from the ground floor, each with a real run, a ground opening and clear cover", () => {
    const flights = map.verticalLinks.filter((l) => l.kind === "stairs" && (l.from.floor === "lower" || l.to.floor === "lower"));
    expect(flights.length).toBe(2);
    for (const l of flights) {
      const run = Math.hypot(l.to.at.x - l.from.at.x, l.to.at.y - l.from.at.y);
      expect(run, l.id).toBeGreaterThanOrEqual(5);
      const x0 = Math.min(l.from.at.x, l.to.at.x), x1 = Math.max(l.from.at.x, l.to.at.x), y0 = Math.min(l.from.at.y, l.to.at.y), y1 = Math.max(l.from.at.y, l.to.at.y);
      const alongX = x1 - x0 > y1 - y0;
      const body = alongX ? rectOf(x0, y0 - 1.5, x1, y1 + 1.5) : rectOf(x0 - 1.5, y0, x1 + 1.5, y1);
      for (const c of floor("lower").cover) expect(overlaps(c.rect, body), `${c.id} blocks ${l.id}`).toBe(false);
      const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      expect(floor("ground").openings.some((o) => o.below === "lower" && mid.x >= o.rect.min.x && mid.x <= o.rect.max.x && mid.y >= o.rect.min.y && mid.y <= o.rect.max.y), `no ground opening over ${l.id}`).toBe(true);
    }
  });

  it("has a door for every room", () => {
    for (const r of floor("lower").rooms) expect(floor("lower").doors.some((d) => d.between.includes(r.id)), r.id).toBe(true);
  });
});

describe("charon.json v6: the shore and the hill", () => {
  it("puts the marina buildings and the yacht on a shore level below the lawn", () => {
    const shore = floor("shore");
    expect(shore.elevation).toBe(-5);
    for (const id of ["grounds.boathouse", "grounds.boathouse.store", "grounds.yacht", "grounds.yacht.bow", "grounds.dock-lounge"]) {
      expect(shore.rooms.some((r) => r.id === id), id).toBe(true);
      expect(floor("grounds").rooms.some((r) => r.id === id), id + " should have left the grounds").toBe(false);
    }
    expect(zone("zone.sea")!.floor).toBe("shore");
    expect(zone("zone.marina")!.floor).toBe("shore");
  });

  it("climbs from the shore to the lawn by the cliff path and by a service stair", () => {
    const cliff = map.verticalLinks.find((l) => l.id === "link.cliff")!;
    expect(cliff).toMatchObject({ kind: "cliff-path", from: { floor: "shore" }, to: { floor: "grounds" } });
    const stair = map.verticalLinks.find((l) => l.id === "link.shore-stair")!;
    expect(stair).toMatchObject({ kind: "stairs", from: { floor: "shore" }, to: { floor: "grounds" }, bidirectional: true });
    expect(Math.hypot(stair.to.at.x - stair.from.at.x, stair.to.at.y - stair.from.at.y)).toBeGreaterThanOrEqual(6);
  });

  it("keeps the tunnel exit in the boathouse, now on the shore", () => {
    expect(room("shore", "grounds.boathouse").tags).toContain("tunnel-exit");
    const t = map.verticalLinks.find((l) => l.id === "link.tunnel")!;
    expect(t.to.floor).toBe("shore");
    expect(inRoom(room("shore", "grounds.boathouse"), t.to.at)).toBe(true);
    expect(inRoom(room("ground", "g.panic"), t.from.at)).toBe(true);
  });

  it("raises the neighboring villas onto hillside terraces above the compound", () => {
    const hill = floor("hill");
    expect(hill.elevation).toBeGreaterThan(0);
    for (const id of ["grounds.villa-west", "grounds.villa-west.wing", "grounds.villa-east", "grounds.villa-east.wing"]) {
      expect(hill.rooms.some((r) => r.id === id), id).toBe(true);
    }
    expect(map.zones.filter((z) => z.floor === "hill" && z.kind === "lawn").length).toBeGreaterThanOrEqual(2);
  });
});

describe("charon.json v6: resort extras", () => {
  it("has an infinity pool at the cliff edge with a cabana", () => {
    const pool = zone("zone.infinity-pool")!;
    expect(pool.kind).toBe("pool");
    expect(pool.rect.min.y).toBeLessThan(3);
    const cabana = room("grounds", "grounds.cabana");
    expect(cabana.tags).toContain("cabana");
    const e = map.markers.find((m) => m.tags.includes("approach:E"))!.at!;
    expect(e.x >= pool.rect.min.x && e.x <= pool.rect.max.x && e.y >= pool.rect.min.y && e.y <= pool.rect.max.y).toBe(false);
    expect(inRoom(cabana, e)).toBe(false);
  });

  it("has a covered dock lounge at the marina (shore level)", () => {
    const lounge = room("shore", "grounds.dock-lounge");
    expect(lounge.tags).toContain("dock-lounge");
    expect(floor("shore").doors.some((d) => d.between.includes("grounds.dock-lounge"))).toBe(true);
  });
});

describe("charon.json v7: roof pavilion and roof garden", () => {
  it("has a roof pavilion beside the radar tower: a walled structure with glass, not an open deck", () => {
    const pavilion = room("roof", "r.pavilion");
    expect(pavilion.tags).toEqual(expect.arrayContaining(["structure", "pavilion"]));
    expect(overlaps(pavilion.rect, BAR_A)).toBe(true);
    expect(floor("roof").windows.some((w) => w.between.includes("r.pavilion") && w.width > 1)).toBe(true);
    expect(floor("roof").doors.filter((d) => d.between.includes("r.pavilion")).length).toBeGreaterThanOrEqual(2);
    expect(floor("roof").rooms.some((r) => r.id === "r.deck.a.n2")).toBe(false);
  });

  it("plants a roof garden of concealment beds on the main deck", () => {
    const beds = cover("roof", "cover.roof-garden");
    expect(beds.length).toBeGreaterThanOrEqual(3);
    for (const b of beds) {
      expect(b.type).toBe("concealment");
      expect(overlapArea(b.rect, room("roof", "r.deck.a").rect)).toBe(area(b.rect));
    }
  });
});

describe("charon.json v7: the fortified perimeter (no towers, sea side left open)", () => {
  const piers = () => cover("grounds", "cover.wall-pier");
  it("has reinforced wall piers along the west, north and east walls, and none on the sea side", () => {
    expect(piers().length).toBeGreaterThanOrEqual(14);
    for (const p of piers()) {
      expect(p.type, p.id).toBe("heavy");
      expect(p.destructible, p.id).toBe(false);
      expect(p.rect.min.y, p.id).toBeGreaterThan(10); // nothing along the cliff
    }
  });

  it("flanks the main gate with piers and narrows the drive behind it with a chicane", () => {
    const gate = floor("grounds").doors.find((d) => d.kind === "gate" && d.at.x === 69)!;
    const flank = piers().filter((p) => Math.abs((p.rect.min.y + p.rect.max.y) / 2 - gate.at.y) < 1 && Math.abs((p.rect.min.x + p.rect.max.x) / 2 - gate.at.x) < gate.width / 2 + 2);
    expect(flank.length).toBeGreaterThanOrEqual(2);
    const barrier = cover("grounds", "cover.gate-barrier");
    expect(barrier).toHaveLength(2);
    const gap = Math.max(...barrier.map((b) => b.rect.min.x)) - Math.min(...barrier.map((b) => b.rect.max.x));
    expect(gap).toBeGreaterThanOrEqual(1.4); // a car still gets through
    expect(gap).toBeLessThanOrEqual(2.2);
  });

  it("lines the drive with bollards", () => {
    expect(cover("grounds", "cover.bollard").length).toBeGreaterThanOrEqual(8);
  });

  it("lights the wall: extra floodlight posts, each with a smart floodlight feeding the SOC", () => {
    const posts = cover("grounds", "cover.floodlight-post");
    expect(posts.length).toBeGreaterThanOrEqual(9);
    const lights = map.markers.filter((m) => m.tags.includes("smart:floodlight"));
    expect(lights.length).toBeGreaterThanOrEqual(12);
    for (const m of lights) expect(m.tags, m.id).toContain("feeds:g.soc");
  });

  it("keeps the west staff gate and the sea side as they were", () => {
    expect(floor("grounds").doors.find((d) => d.id === "d.staff-gate")).toMatchObject({ kind: "gate", at: { x: 0, y: 64 } });
    expect(floor("grounds").walls.filter((w) => w.material === "perimeter").every((w) => Math.min(w.a.y, w.b.y) >= 0 && !(w.a.y === 0 && w.b.y === 0))).toBe(true);
  });
});

describe("charon.json v7: terrain features", () => {
  it("has earth berms inside the west and east walls as heavy, indestructible cover", () => {
    const berms = cover("grounds", "cover.berm");
    expect(berms.length).toBeGreaterThanOrEqual(4);
    expect(berms.some((b) => b.rect.max.x < 20)).toBe(true);
    expect(berms.some((b) => b.rect.min.x > 80)).toBe(true);
    for (const b of berms) {
      expect(b.type).toBe("heavy");
      expect(b.destructible).toBe(false);
    }
  });

  it("scatters rock outcrops along the cliff edge and a retaining wall in the garden notch", () => {
    const rocks = cover("grounds", "cover.rock");
    expect(rocks.length).toBeGreaterThanOrEqual(5);
    for (const r of rocks) expect(r.rect.max.y, r.id).toBeLessThan(8);
    const walls = cover("grounds", "cover.retaining-wall");
    expect(walls.length).toBeGreaterThanOrEqual(2);
    for (const w of walls) expect(overlapArea(w.rect, rectOf(12, 26, 40, 41)), w.id).toBe(area(w.rect));
  });
});

describe("charon.json v8: a busier roof", () => {
  it("has a rooftop plant house on bar B: a walled structure with a generator, split out of deck B", () => {
    const plant = room("roof", "r.plant-house");
    expect(plant.tags).toEqual(expect.arrayContaining(["structure", "plant-house"]));
    expect(overlaps(plant.rect, BAR_B)).toBe(true);
    expect(cover("roof", "cover.plant-gen").length).toBeGreaterThanOrEqual(2);
    for (const c of cover("roof", "cover.plant-gen")) expect(overlapArea(c.rect, plant.rect), c.id).toBe(area(c.rect));
    expect(floor("roof").doors.filter((d) => d.between.includes("r.plant-house")).length).toBeGreaterThanOrEqual(2);
    // deck B is split around it with no overlap
    for (const id of ["r.deck.b", "r.deck.b.e", "r.deck.b.ee"]) expect(overlaps(room("roof", id).rect, plant.rect), id).toBe(false);
  });

  it("has skylights over the double-height hall (low glass cover on deck A)", () => {
    const sky = cover("roof", "cover.skylight");
    expect(sky.length).toBeGreaterThanOrEqual(2);
    for (const c of sky) {
      expect(c.height).toBeLessThan(1);
      expect(overlapArea(c.rect, room("roof", "r.deck.a").rect), c.id).toBe(area(c.rect));
    }
  });
});
