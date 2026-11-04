import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Floor, Marker } from "@war-room/content";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url)), "utf8")));
const floor = (id: string): Floor => map.floors.find((f) => f.id === id)!;
const fixtures = (kind: string): Marker[] => map.markers.filter((m) => m.tags.includes(`fixture:${kind}`));
const inside = (r: { min: { x: number; y: number }; max: { x: number; y: number } }, p: { x: number; y: number }): boolean => p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;

describe("charon.json: small details that make the house feel lived in", () => {
  it("has a staff route: the kitchen opens to the service core (stairs and lift) without crossing the hall", () => {
    const d = floor("ground").doors.find((x) => x.id === "d.g.kitchen-core")!;
    expect(d.between).toEqual(expect.arrayContaining(["g.kitchen", "g.core"]));
    expect(d.width).toBeLessThanOrEqual(1.2); // a service door, not a grand one
  });

  it("has fire extinguishers and exit signs spread over the ground, upper and lower floors", () => {
    const ext = fixtures("extinguisher"), signs = fixtures("exit-sign");
    expect(ext.length).toBeGreaterThanOrEqual(15);
    expect(signs.length).toBeGreaterThanOrEqual(6);
    for (const fl of ["ground", "upper", "lower"]) {
      expect(ext.some((m) => m.floor === fl), `an extinguisher on ${fl}`).toBe(true);
      expect(signs.some((m) => m.floor === fl), `an exit sign on ${fl}`).toBe(true);
    }
  });

  it("puts every indoor fixture inside a room on its floor, and keeps fixtures out of the circuits and lock tables", () => {
    for (const m of map.markers.filter((x) => x.tags.some((t) => t.startsWith("fixture:")))) {
      expect(m.kind, m.id).toBe("poi");
      expect(m.tags.some((t) => /^(circuit|vlan|door|fail|auth|svc|sec|util|comms):/.test(t)), `${m.id} stays out of the utility and access layers`).toBe(false);
      if (["grounds", "shore", "hill"].includes(m.floor)) continue;
      expect(floor(m.floor).rooms.some((r) => !r.tags.includes("void") && inside(r.rect, m.at!)), `${m.id} is in a room`).toBe(true);
    }
  });

  it("gives the panic room a supply locker and a medical cabinet", () => {
    const panic = floor("ground").rooms.find((r) => r.tags.includes("panic-room"))!;
    for (const kind of ["supply-locker", "medical-cabinet"]) {
      const m = fixtures(kind);
      expect(m.length, kind).toBe(1);
      expect(inside(panic.rect, m[0]!.at!), kind).toBe(true);
    }
    const locker = floor("ground").cover.find((c) => c.id === "cover.panic-supply-locker")!;
    expect(locker.rect.min.x).toBeGreaterThanOrEqual(panic.rect.min.x);
    expect(locker.rect.max.x).toBeLessThanOrEqual(panic.rect.max.x - 0.2); // clear of the wall
  });

  it("dresses the working spaces: garage, boathouse, service room, pool equipment, gate and garden path", () => {
    const has = (fl: string, id: string): boolean => floor(fl).cover.some((c) => c.id === id);
    for (const id of ["cover.garage-workbench", "cover.garage-lift", "cover.ev-charger.1", "cover.ev-charger.2", "cover.pool-pump", "cover.pool-chemicals"]) expect(has("grounds", id), id).toBe(true);
    for (const id of ["cover.boathouse-fuel-pump", "cover.boathouse-rope-lockers", "cover.boathouse-winch"]) expect(has("shore", id), id).toBe(true);
    for (const id of ["cover.staff-table", "cover.pantry-shelves"]) expect(has("ground", id), id).toBe(true);
    expect(fixtures("intercom").length).toBe(1);
    expect(fixtures("path-light").length).toBeGreaterThanOrEqual(6);
    const path = map.zones.find((z) => z.id === "zone.notch-path")!;
    for (const m of fixtures("path-light")) {
      expect(m.at!.y, m.id).toBeGreaterThanOrEqual(path.rect.min.y);
      expect(m.at!.y, m.id).toBeLessThanOrEqual(path.rect.max.y);
    }
  });
});
