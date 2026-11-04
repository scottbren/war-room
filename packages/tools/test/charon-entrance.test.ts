import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Door, Floor, Room } from "@war-room/content";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url)), "utf8")));
const floor = (id: string): Floor => map.floors.find((f) => f.id === id)!;
const room = (f: string, id: string): Room => floor(f).rooms.find((r) => r.id === id)!;
const door = (id: string): Door | undefined => floor("ground").doors.find((d) => d.id === id);
const doorsOf = (f: string, roomId: string): string[] => floor(f).doors.filter((d) => d.between.includes(roomId)).map((d) => d.id).sort();

describe("charon.json: the entrance, the grand hall and the garden side", () => {
  it("has no door that makes no sense: the cloak room and guard room are reached from the foyer, the library is not joined to the cloak room, the kitchen is not on the hall or the study", () => {
    for (const id of ["d.g.cloak-hall", "d.g.security-hall", "d.g.library-cloak", "d.g.kitchen-study", "d.g.hall-kitchen"]) expect(door(id), id).toBeUndefined();
    expect(doorsOf("ground", "g.cloak")).toEqual(["d.g.foyer-cloak"]);
    expect(doorsOf("ground", "g.security")).toEqual(["d.g.foyer-security"]);
    expect(doorsOf("ground", "g.kitchen").some((id) => /study|hall/.test(id))).toBe(false);
    for (const k of map.markers) expect(JSON.stringify(k), k.id).not.toMatch(/d\.g\.(cloak-hall|security-hall|library-cloak|kitchen-study|hall-kitchen)/); // nothing keeps a lock on a door that is gone
  });

  it("opens the hall to a garden room on its garden side, and the garden room to the garden", () => {
    const bay = room("ground", "g.garden-room"), hall = room("ground", "g.grand-hall");
    expect(bay.tags).toContain("interior");
    expect(bay.rect.max.y).toBe(hall.rect.min.y); // it sits against the hall's north wall...
    expect(bay.rect.min.x).toBeGreaterThanOrEqual(hall.rect.min.x);
    expect(bay.rect.max.x).toBeLessThanOrEqual(hall.rect.max.x);
    const wide = floor("ground").doors.find((d) => d.between.includes("g.garden-room") && d.between.includes("g.grand-hall"))!;
    expect(wide.width).toBeGreaterThanOrEqual(5); // ...and opens wide onto it
    expect(wide.state).toBe("open");
    const garden = floor("ground").doors.filter((d) => d.between.includes("g.garden-room") && d.between.includes("outside"));
    expect(garden.length).toBeGreaterThanOrEqual(2); // a door on the garden axis and one to the terrace
    for (const d of garden) expect(d.kind, d.id).toBe("glass");
    expect(floor("ground").doors.some((d) => d.between.includes("g.garden-room") && d.between.includes("g.drawing"))).toBe(true);
    // The garden doors face the garden: the path from the north door runs on from it.
    const north = garden.find((d) => d.at.y === bay.rect.min.y)!;
    const path = map.zones.find((z) => z.id === "zone.notch-path")!;
    expect(north.at.x).toBeGreaterThan(path.rect.min.x);
    expect(north.at.x).toBeLessThan(path.rect.max.x);
    expect(path.rect.max.y).toBe(bay.rect.min.y); // the notch path ends at the door instead of running under the room
  });

  it("has a French door from the library to the west garden and a service door from the kitchen", () => {
    const french = door("d.g.library-garden")!;
    expect(french.kind).toBe("glass");
    expect(french.between).toEqual(expect.arrayContaining(["g.library", "outside"]));
    expect(french.at.x).toBe(room("ground", "g.library").rect.min.x);
    const yard = door("d.g.kitchen-yard")!;
    expect(yard.between).toEqual(expect.arrayContaining(["g.kitchen", "outside"]));
    expect(floor("ground").windows.some((w) => w.id === "win.g.library.w" || w.id === "win.g.kitchen.e")).toBe(false); // the doors replaced them
  });

  it("keeps the grand hall floor clear: nothing stands in it", () => {
    const hall = room("ground", "g.grand-hall").rect;
    const inside = floor("ground").cover.filter((c) => c.rect.min.x < hall.max.x && c.rect.max.x > hall.min.x && c.rect.min.y < hall.max.y && c.rect.max.y > hall.min.y);
    expect(inside.map((c) => c.id)).toEqual([]);
  });

  it("keeps the piano where a piano belongs, in the drawing room", () => {
    const piano = floor("ground").cover.find((c) => c.id === "cover.drawing-piano")!;
    const r = room("ground", "g.drawing").rect;
    expect(piano.rect.min.x).toBeGreaterThanOrEqual(r.min.x);
    expect(piano.rect.max.x).toBeLessThanOrEqual(r.max.x);
    expect(piano.rect.min.y).toBeGreaterThanOrEqual(r.min.y);
    expect(piano.rect.max.y).toBeLessThanOrEqual(r.max.y);
    expect(piano.rect.max.x - piano.rect.min.x).toBeLessThanOrEqual(3.2); // a concert grand is under 3 m long
    expect(floor("ground").cover.some((c) => c.id === "cover.grand-piano")).toBe(false);
  });

  it("leaves 1.4 m in front of every door in the entrance area free of furniture, on both floors", () => {
    const APPROACH = 1.4;
    for (const fid of ["ground", "upper"]) {
      const f = floor(fid);
      for (const d of f.doors) {
        if (!(d.at.x >= 12 && d.at.x <= 62 && d.at.y >= 26 && d.at.y <= 62)) continue;
        const owner = d.between.map((id) => f.rooms.find((r) => r.id === id)).find((r) => r !== undefined)!;
        const vertical = [owner.rect.min.x, owner.rect.max.x].includes(d.at.x) && !([owner.rect.min.y, owner.rect.max.y].includes(d.at.y) && d.at.x !== owner.rect.min.x && d.at.x !== owner.rect.max.x);
        const half = d.width / 2;
        const zone = vertical
          ? { x0: d.at.x - APPROACH, x1: d.at.x + APPROACH, y0: d.at.y - half, y1: d.at.y + half }
          : { x0: d.at.x - half, x1: d.at.x + half, y0: d.at.y - APPROACH, y1: d.at.y + APPROACH };
        for (const c of f.cover) {
          if (c.type === "concealment" || c.height <= 0.4) continue;
          const hit = c.rect.min.x < zone.x1 && c.rect.max.x > zone.x0 && c.rect.min.y < zone.y1 && c.rect.max.y > zone.y0;
          expect(hit, `${c.id} stands in front of ${d.id}`).toBe(false);
        }
      }
    }
  });
});
