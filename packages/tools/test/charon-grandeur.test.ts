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
const area = (r: Room) => (r.rect.max.x - r.rect.min.x) * (r.rect.max.y - r.rect.min.y);
const overlaps = (a: Room, b: Room) => a.rect.min.x < b.rect.max.x && b.rect.min.x < a.rect.max.x && a.rect.min.y < b.rect.max.y && b.rect.min.y < a.rect.max.y;
const inRoom = (r: Room, p: { x: number; y: number }) => p.x >= r.rect.min.x && p.x <= r.rect.max.x && p.y >= r.rect.min.y && p.y <= r.rect.max.y;

describe("charon.json v5: modern style (no classical leftovers)", () => {
  it("has no belvedere, colonnades, parterre, balustrades or urns", () => {
    expect(floor("grounds").rooms.some((r) => r.id === "grounds.belvedere")).toBe(false);
    for (const prefix of ["cover.colonnade", "cover.parterre", "cover.balustrade", "cover.forecourt-urn", "cover.portico-column"]) {
      for (const f of map.floors) expect(f.cover.filter((c) => c.id.startsWith(prefix)), `${prefix} on ${f.id}`).toEqual([]);
    }
  });

  it("has a flat concrete canopy over the entrance with two heavy piers, and a plain water feature in the forecourt", () => {
    const portico = room("ground", "g.portico");
    expect(portico.tags).toEqual(expect.arrayContaining(["exterior", "portico"]));
    expect(cover("ground", "cover.canopy-pier").length).toBe(2);
    for (const c of cover("ground", "cover.canopy-pier")) expect(c.type).toBe("heavy");
    expect(cover("grounds", "cover.forecourt-pool").length).toBeGreaterThanOrEqual(1);
    expect(zone("zone.forecourt")).toBeDefined();
  });

  it("keeps the main door, the open canopy and the helipad landing zone as before", () => {
    const main = floor("ground").doors.find((d) => d.id === "d.g.main")!;
    expect(main.between).toEqual(["g.foyer", "g.portico"]);
    const lz = map.markers.find((m) => m.id === "m.lz.helipad")!.at!;
    for (const c of cover("grounds", "cover.forecourt")) {
      expect(lz.x >= c.rect.min.x && lz.x <= c.rect.max.x && lz.y >= c.rect.min.y && lz.y <= c.rect.max.y, c.id).toBe(false);
    }
  });

  it("has raised planters on the terraces and on the main roof deck", () => {
    expect(cover("grounds", "cover.planter.").length).toBeGreaterThanOrEqual(6);
    expect(cover("roof", "cover.roof-planter").length).toBeGreaterThanOrEqual(3);
  });
});

describe("charon.json v5: stacked volumes", () => {
  it("has an upper floor with a different footprint from the ground floor", () => {
    const upperHouse = floor("upper").rooms.filter((r) => r.tags.includes("interior")).reduce((s, r) => s + area(r), 0);
    expect(upperHouse).not.toBe(44 * 40);
  });

  it("has a covered sun terrace on the upper floor, over the master suite", () => {
    const t = room("upper", "u.terrace.sw");
    expect(t.tags).toEqual(expect.arrayContaining(["exterior", "terrace"]));
    expect(overlaps(t, room("ground", "g.master"))).toBe(true);
    const doors = floor("upper").doors.filter((d) => d.between.includes("u.terrace.sw"));
    expect(doors.length).toBeGreaterThanOrEqual(2);
    expect(floor("upper").rooms.some((r) => r.id === "u.gym")).toBe(false); // the gym moved to the basement
  });

  it("has a sky lounge that cantilevers out over the south terrace (nothing under it on the ground floor)", () => {
    const lounge = room("upper", "u.sky-lounge");
    expect(lounge.tags).toContain("interior");
    for (const r of floor("ground").rooms) expect(overlaps(lounge, r), r.id).toBe(false);
    expect(lounge.rect.min.y).toBeLessThan(16); // beyond the south face of the house
    const door = floor("upper").doors.find((d) => d.between.includes("u.sky-lounge"))!;
    expect(door.kind).toBe("glass");
    const glass = floor("upper").windows.filter((w) => w.between.includes("u.sky-lounge"));
    expect(glass.length).toBeGreaterThanOrEqual(2);
    for (const w of glass) expect(w.shutter, w.id).toBe(true);
  });
});

describe("charon.json v5: the basement (lower)", () => {
  it("is a floor at -4 m with gym, cellar, storage, armory, vault and plant rooms, all indoors", () => {
    const lower = floor("lower");
    expect(lower.elevation).toBe(-4);
    expect(lower.rooms.length).toBe(9);
    for (const r of lower.rooms) expect(r.tags, r.id).toContain("interior");
    for (const id of ["l.gym", "l.cellar", "l.storage", "l.armory", "l.vault", "l.mech", "l.staff"]) expect(room("lower", id)).toBeDefined();
    expect(lower.windows).toEqual([]);
  });

  it("sits under the house (every basement room overlaps a ground-floor house room)", () => {
    for (const r of floor("lower").rooms) {
      expect(floor("ground").rooms.some((g) => overlaps(r, g)), r.id).toBe(true);
    }
  });

  it("is reached by two stair flights from the ground floor, each with a real run", () => {
    const flights = map.verticalLinks.filter((l) => l.kind === "stairs" && (l.from.floor === "lower" || l.to.floor === "lower"));
    expect(flights.length).toBe(2);
    for (const l of flights) {
      const run = Math.hypot(l.to.at.x - l.from.at.x, l.to.at.y - l.from.at.y);
      expect(run, l.id).toBeGreaterThanOrEqual(5); // 4 m of rise needs a walkable run
    }
  });

  it("cuts the ground floor over each basement stair, and keeps basement cover off the stairs", () => {
    const flights = map.verticalLinks.filter((l) => l.kind === "stairs" && (l.from.floor === "lower" || l.to.floor === "lower"));
    for (const l of flights) {
      const x0 = Math.min(l.from.at.x, l.to.at.x), x1 = Math.max(l.from.at.x, l.to.at.x);
      const y0 = Math.min(l.from.at.y, l.to.at.y), y1 = Math.max(l.from.at.y, l.to.at.y);
      // the stair body: 3 m wide across its run
      const alongX = x1 - x0 > y1 - y0;
      const body = alongX ? { x0, x1, y0: y0 - 1.5, y1: y1 + 1.5 } : { x0: x0 - 1.5, x1: x1 + 1.5, y0, y1 };
      const hit = (r: { min: { x: number; y: number }; max: { x: number; y: number } }) => r.min.x < body.x1 && r.max.x > body.x0 && r.min.y < body.y1 && r.max.y > body.y0;
      for (const c of floor("lower").cover) expect(hit(c.rect), `${c.id} blocks ${l.id}`).toBe(false);
      const op = floor("ground").openings.find((o) => o.below === "lower" && o.rect.min.x <= (x0 + x1) / 2 && o.rect.max.x >= (x0 + x1) / 2 && o.rect.min.y <= (y0 + y1) / 2 && o.rect.max.y >= (y0 + y1) / 2);
      expect(op, `no ground opening over ${l.id}`).toBeDefined();
    }
  });

  it("has a connected corridor system (every room has a door)", () => {
    const lower = floor("lower");
    for (const r of lower.rooms) expect(lower.doors.some((d) => d.between.includes(r.id)), r.id).toBe(true);
  });
});

describe("charon.json v5: the shore and the hill", () => {
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
  });

  it("raises the neighboring villas onto hillside terraces above the compound", () => {
    const hill = floor("hill");
    expect(hill.elevation).toBeGreaterThan(0);
    for (const id of ["grounds.villa-west", "grounds.villa-west.wing", "grounds.villa-east", "grounds.villa-east.wing"]) {
      expect(hill.rooms.some((r) => r.id === id), id).toBe(true);
      expect(floor("grounds").rooms.some((r) => r.id === id), id + " should have left the grounds").toBe(false);
    }
    expect(map.zones.filter((z) => z.floor === "hill" && z.kind === "lawn").length).toBeGreaterThanOrEqual(2);
  });
});

describe("charon.json v5: resort extras", () => {
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

  it("has a reflecting pool, an outdoor lounge platform, and cameras on the front spaces", () => {
    expect(zone("zone.reflecting-pool")!.kind).toBe("pool");
    expect(cover("grounds", "cover.lounge-platform").length).toBeGreaterThanOrEqual(1);
    const cams = map.markers.filter((m) => m.tags.includes("smart:camera"));
    for (const name of ["portico", "forecourt"]) {
      const cam = cams.find((m) => m.tags.includes("covers:" + name));
      expect(cam, name).toBeDefined();
      expect(cam!.tags).toContain("feeds:g.soc");
    }
  });
});
