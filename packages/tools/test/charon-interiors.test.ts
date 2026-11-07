import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Floor } from "@war-room/content";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url)), "utf8")));
const floorOf = (id: string): Floor => map.floors.find((f) => f.id === id)!;

/** The rooms furnished in the interiors pass (docs/charon-layout.md), with the floor each is on. The grand hall is deliberately left clear (see charon-entrance.test.ts). */
const FURNISHED: [floor: string, room: string][] = [
  ["ground", "g.cloak"], ["ground", "g.foyer"], ["ground", "g.garage-link"], ["ground", "g.core"], ["ground", "g.core.bc"], ["ground", "g.master-bath"],
  ["upper", "u.gallery"], ["upper", "u.core"], ["upper", "u.safe"], ["upper", "u.guest2"], ["upper", "u.core.bc"], ["upper", "u.bath"], ["upper", "u.gallery.n"], ["upper", "u.gallery.w"], ["upper", "u.gallery.e"],
  ["lower", "l.staff"], ["lower", "l.corridor.a"], ["lower", "l.corridor.b"],
];

describe("charon.json: interiors pass", () => {
  it("gives every room exactly one light level: bright, dim or dark", () => {
    const seen = { bright: 0, dim: 0, dark: 0 };
    for (const f of map.floors) {
      for (const r of f.rooms) {
        const tags = r.tags.filter((t) => t.startsWith("light:"));
        expect(tags, r.id).toHaveLength(1);
        const level = (tags[0] as string).slice(6) as keyof typeof seen;
        expect(Object.keys(seen), `${r.id}: ${level}`).toContain(level);
        seen[level]++;
      }
    }
    expect(seen.bright).toBeGreaterThan(0);
    expect(seen.dim).toBeGreaterThan(0);
    expect(seen.dark).toBeGreaterThan(0);
  });

  it("furnishes each of the 18 rooms (all but the grand hall) with cover that lies inside the room", () => {
    for (const [floor, id] of FURNISHED) {
      const room = floorOf(floor).rooms.find((r) => r.id === id);
      expect(room, id).toBeDefined();
      const { min, max } = room!.rect;
      const inside = floorOf(floor).cover.filter((c) => c.rect.min.x >= min.x && c.rect.min.y >= min.y && c.rect.max.x <= max.x && c.rect.max.y <= max.y);
      expect(inside.length, `${id} has no furniture`).toBeGreaterThan(0);
    }
  });

  it("leaves the grand hall clear, as the layout says", () => {
    const hall = floorOf("ground").rooms.find((r) => r.id === "g.grand-hall")!.rect;
    const inside = floorOf("ground").cover.filter((c) => c.rect.min.x < hall.max.x && c.rect.max.x > hall.min.x && c.rect.min.y < hall.max.y && c.rect.max.y > hall.min.y);
    expect(inside).toEqual([]);
  });

  it("is a new map version, so older recordings are refused", () => {
    expect(map.version).toBe(13);
  });

  it("keeps cover items unique and facing set", () => {
    for (const f of map.floors) {
      expect(new Set(f.cover.map((c) => c.id)).size).toBe(f.cover.length);
      for (const c of f.cover) expect(c.facing, c.id).toBeDefined();
    }
  });
});
