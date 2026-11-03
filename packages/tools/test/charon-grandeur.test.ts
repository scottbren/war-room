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
const inside = (r: Room, p: { x: number; y: number }) => p.x > r.rect.min.x && p.x < r.rect.max.x && p.y > r.rect.min.y && p.y < r.rect.max.y;

describe("charon.json v4: the grand entrance", () => {
  it("has a columned porte-cochere in front of the main door, open to the drive", () => {
    const portico = room("ground", "g.portico");
    expect(portico.tags).toEqual(expect.arrayContaining(["exterior", "portico"]));
    const main = floor("ground").doors.find((d) => d.id === "d.g.main")!;
    expect(main.between).toEqual(["g.foyer", "g.portico"]);
    expect(main.state).toBe("locked");
    const open = floor("ground").doors.find((d) => d.between.includes("g.portico") && d.between.includes("outside"))!;
    expect(open.state).toBe("open");
    expect(open.width).toBeGreaterThanOrEqual(6);
    // centered on the front door
    expect((portico.rect.min.x + portico.rect.max.x) / 2).toBe(main.at.x);
    expect(cover("ground", "cover.portico-column").length).toBeGreaterThanOrEqual(4);
  });

  it("has a forecourt fountain beside the helipad, with urns", () => {
    expect(cover("grounds", "cover.forecourt-fountain").length).toBeGreaterThanOrEqual(1);
    expect(cover("grounds", "cover.forecourt-urn").length).toBeGreaterThanOrEqual(4);
    expect(zone("zone.forecourt")).toBeDefined();
    // the helipad landing zone stays clear
    const lz = map.markers.find((m) => m.id === "m.lz.helipad")!.at!;
    for (const c of cover("grounds", "cover.forecourt")) {
      expect(lz.x >= c.rect.min.x && lz.x <= c.rect.max.x && lz.y >= c.rect.min.y && lz.y <= c.rect.max.y, c.id).toBe(false);
    }
  });
});

describe("charon.json v4: villa architecture", () => {
  it("has colonnades in front of the wings (south terrace and under the north balcony)", () => {
    expect(cover("grounds", "cover.colonnade.south").length).toBeGreaterThanOrEqual(8);
    expect(cover("grounds", "cover.colonnade.north").length).toBeGreaterThanOrEqual(3);
  });

  it("has a domed belvedere (rotunda) on the garden axis south of the courtyard", () => {
    const b = room("grounds", "grounds.belvedere");
    expect(b.tags).toContain("rotunda");
    expect(b.ceiling).toBeGreaterThanOrEqual(6);
    expect((b.rect.min.x + b.rect.max.x) / 2).toBe(50); // on the axis through the fountain and front door
    const doors = floor("grounds").doors.filter((d) => d.between.includes("grounds.belvedere"));
    expect(doors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("charon.json v4: formal grounds", () => {
  it("has a reflecting pool on the axis, parterre beds and a balustraded upper terrace", () => {
    const pool = zone("zone.reflecting-pool")!;
    expect(pool.kind).toBe("pool");
    expect((pool.rect.min.x + pool.rect.max.x) / 2).toBe(50);
    expect(cover("grounds", "cover.parterre").length).toBeGreaterThanOrEqual(12);
    const rails = cover("grounds", "cover.balustrade");
    expect(rails.length).toBeGreaterThanOrEqual(2);
    // a gap on the axis so the terrace can be walked down
    for (const r of rails) expect(r.rect.min.x <= 50 && r.rect.max.x >= 50, r.id).toBe(false);
  });

  it("keeps the parterre out of the belvedere and the pool house", () => {
    const b = room("grounds", "grounds.belvedere").rect;
    for (const c of cover("grounds", "cover.parterre")) {
      const overlaps = c.rect.min.x < b.max.x && c.rect.max.x > b.min.x && c.rect.min.y < b.max.y && c.rect.max.y > b.min.y;
      expect(overlaps, c.id).toBe(false);
    }
  });
});

describe("charon.json v4: resort extras", () => {
  it("has an infinity pool at the cliff edge with a cabana", () => {
    const pool = zone("zone.infinity-pool")!;
    expect(pool.kind).toBe("pool");
    expect(pool.rect.min.y).toBeGreaterThanOrEqual(0);
    expect(pool.rect.min.y).toBeLessThan(3); // at the cliff edge
    const cabana = room("grounds", "grounds.cabana");
    expect(cabana.tags).toContain("cabana");
    expect(floor("grounds").doors.some((d) => d.between.includes("grounds.cabana"))).toBe(true);
    // the cliff path marker is not inside the pool or the cabana
    const e = map.markers.find((m) => m.tags.includes("approach:E"))!.at!;
    expect(e.x >= pool.rect.min.x && e.x <= pool.rect.max.x && e.y >= pool.rect.min.y && e.y <= pool.rect.max.y).toBe(false);
    expect(inside(cabana, e)).toBe(false);
  });

  it("has a covered dock lounge at the marina", () => {
    const lounge = room("grounds", "grounds.dock-lounge");
    expect(lounge.tags).toContain("dock-lounge");
    expect(lounge.rect.min.y).toBeLessThan(0); // on the water side
    expect(floor("grounds").doors.some((d) => d.between.includes("grounds.dock-lounge"))).toBe(true);
  });

  it("has cameras on the new front spaces, feeding the SOC", () => {
    const cams = map.markers.filter((m) => m.tags.includes("smart:camera"));
    for (const name of ["portico", "forecourt"]) {
      const cam = cams.find((m) => m.tags.includes("covers:" + name));
      expect(cam, name).toBeDefined();
      expect(cam!.tags).toContain("feeds:g.soc");
    }
  });
});
