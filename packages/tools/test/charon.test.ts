import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Floor } from "@war-room/content";
import { deriveWalls, formatMap } from "../src/derive-walls";

const file = fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url));
const text = readFileSync(file, "utf8");
const map = MapFile.parse(JSON.parse(text));
const floor = (id: string): Floor => map.floors.find((f) => f.id === id)!;

describe("charon.json", () => {
  it("parses against the schema", () => {
    expect(map.id).toBe("charon");
    expect(map.version).toBe(1);
    expect(map.floors.map((f) => f.id)).toEqual(["grounds", "ground", "upper", "roof"]);
    expect(map.floors.map((f) => f.elevation)).toEqual([0, 0, 4, 8]);
  });

  it("has the expected room count per floor", () => {
    expect(floor("grounds").rooms).toHaveLength(8);
    expect(floor("ground").rooms).toHaveLength(14);
    expect(floor("upper").rooms).toHaveLength(15);
    expect(floor("roof").rooms).toHaveLength(1);
  });

  it("has the rooms from the layout doc at the right map coordinates (local + (32,16))", () => {
    const g = (id: string) => floor("ground").rooms.find((r) => r.id === id)!;
    expect(g("g.hall").rect).toEqual({ min: { x: 48, y: 16 }, max: { x: 52, y: 52 } });
    expect(g("g.panic").rect).toEqual({ min: { x: 52, y: 16 }, max: { x: 62, y: 28 } });
    expect(g("g.great").ceiling).toBe(8);
    const u = (id: string) => floor("upper").rooms.find((r) => r.id === id)!;
    expect(u("u.son").tags).toContain("family");
    expect(u("u.wife").tags).toContain("family");
    expect(u("u.daughter").tags).toContain("family");
    expect(u("u.balcony").rect.min.y).toBe(13);
  });

  it("fills the two leftover upper-floor spaces with an upstairs restroom and a storage closet", () => {
    const u = (id: string) => floor("upper").rooms.find((r) => r.id === id)!;
    expect(u("u.wc").rect).toEqual({ min: { x: 60, y: 28 }, max: { x: 68, y: 34 } });
    expect(u("u.storage").rect).toEqual({ min: { x: 48, y: 52 }, max: { x: 52, y: 56 } });
    const doors = floor("upper").doors;
    expect(doors.find((d) => d.between.includes("u.wc"))?.between).toEqual(["u.wc", "u.stairs"]);
    expect(doors.find((d) => d.between.includes("u.storage"))?.between).toEqual(["u.storage", "u.hall"]);
  });

  it("leaves no unassigned space inside the upper-floor house outline", () => {
    const area = (r: { min: { x: number; y: number }; max: { x: number; y: number } }) =>
      (r.max.x - r.min.x) * (r.max.y - r.min.y);
    const house = floor("upper").rooms.filter((r) => r.tags.includes("interior"));
    expect(house.reduce((sum, r) => sum + area(r.rect), 0)).toBe(36 * 40);
    expect(floor("ground").rooms.reduce((sum, r) => sum + area(r.rect), 0)).toBe(36 * 40);
  });

  it("has unique ids across each floor and in every list", () => {
    const unique = (ids: string[]) => expect(new Set(ids).size).toBe(ids.length);
    for (const f of map.floors) {
      unique(f.rooms.map((r) => r.id));
      unique(f.walls.map((w) => w.id));
      unique(f.doors.map((d) => d.id));
      unique(f.windows.map((w) => w.id));
      unique(f.cover.map((c) => c.id));
    }
    unique(map.floors.flatMap((f) => f.doors.map((d) => d.id)));
    unique(map.verticalLinks.map((l) => l.id));
    unique(map.zones.map((z) => z.id));
    unique(map.markers.map((m) => m.id));
  });

  it("has walls that match what derive-walls produces (nothing stale, nothing hand-edited)", () => {
    expect(deriveWalls(map)).toEqual(map);
    expect(formatMap(map)).toBe(text);
  });

  it("puts every door on a wall line (inside a wall run, or in the gap cut for it)", () => {
    for (const f of map.floors) {
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
    const panic = floor("ground").rooms.find((r) => r.id === "g.panic")!.rect;
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

  it("has the vertical links from the layout doc", () => {
    const l = (id: string) => map.verticalLinks.find((x) => x.id === id)!;
    expect(l("link.stairs")).toMatchObject({ kind: "stairs", from: { floor: "ground", at: { x: 56, y: 31 } }, to: { floor: "upper", at: { x: 56, y: 31 } } });
    expect(l("link.roof")).toMatchObject({ kind: "roof-access", from: { floor: "upper" }, to: { floor: "roof" } });
    expect(l("link.shaft")).toMatchObject({ kind: "shaft", from: { floor: "upper", at: { x: 60, y: 26 } }, to: { floor: "ground", at: { x: 60, y: 26 } } });
    expect(l("link.shaft").restrictedTo).toEqual(["principal", "family"]);
    expect(l("link.tunnel")).toMatchObject({ kind: "shaft", from: { floor: "ground", at: { x: 57, y: 18 } }, to: { floor: "grounds", at: { x: 85, y: 0 } } });
    expect(l("link.cliff")).toMatchObject({ kind: "cliff-path", from: { at: { x: 18, y: -6 } }, to: { at: { x: 18, y: 0 } } });
  });

  it("has the five approach markers and the helipad landing zone", () => {
    const approach = (tag: string) => map.markers.find((m) => m.kind === "approach" && m.tags.includes(tag));
    expect(approach("approach:A")?.at).toEqual({ x: 69, y: 81 });
    expect(approach("approach:B")?.at).toEqual({ x: 0, y: 40 });
    expect(approach("approach:C")?.at).toEqual({ x: 48, y: 68 });
    expect(approach("approach:D")?.at).toEqual({ x: 88, y: -2 });
    expect(approach("approach:E")?.at).toEqual({ x: 18, y: 0 });
    expect(map.markers.find((m) => m.kind === "lz")?.floor).toBe("grounds");
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

  it("has planters along the terrace as light, low cover", () => {
    const planters = floor("grounds").cover.filter((c) => c.id.startsWith("cover.planter"));
    expect(planters.length).toBeGreaterThanOrEqual(4);
    for (const p of planters) expect(p).toMatchObject({ type: "light" });
    for (const p of planters) expect(p.height).toBeLessThan(1.2);
  });

  it("has the gallery void opening onto the ground floor, and a roof parapet as cover", () => {
    expect(floor("upper").openings).toEqual([
      expect.objectContaining({ kind: "gallery-void", below: "ground", rect: { min: { x: 32, y: 40 }, max: { x: 44, y: 56 } } }),
    ]);
    expect(floor("roof").cover.length).toBe(4);
    expect(floor("roof").walls).toEqual([]);
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
  });

  it("loads in the headless harness", async () => {
    const { loadMap } = await import("../src/headlessCore");
    expect(loadMap("charon").id).toBe("charon");
  });
});
