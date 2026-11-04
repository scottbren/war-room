import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav } from "../../sim/src/nav";
import type { Nav } from "../../sim/src/nav";
import type { Pos } from "../../sim/src";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const map = MapFile.parse(JSON.parse(read("../../content/maps/charon.json").toString("utf8")));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(read("../../content/generated/charon.navmesh.bin")), map });
});

/** The capsule is drawn 0.3 m in radius; a path may graze a wall by a few centimetres but must not cut into it. */
const RADIUS = 0.3;
const TOLERANCE = 0.08;

interface Box { id: string; floor: string; x0: number; y0: number; x1: number; y1: number }
function solids(): Box[] {
  const out: Box[] = [];
  for (const f of map.floors) {
    for (const w of f.walls) {
      const t = w.thickness / 2;
      const v = w.a.x === w.b.x;
      out.push({ id: w.id, floor: f.id, x0: Math.min(w.a.x, w.b.x) - (v ? t : 0), x1: Math.max(w.a.x, w.b.x) + (v ? t : 0), y0: Math.min(w.a.y, w.b.y) - (v ? 0 : t), y1: Math.max(w.a.y, w.b.y) + (v ? 0 : t) });
    }
    for (const c of f.cover) {
      if (c.type === "concealment" || c.height <= 0.4) continue;
      out.push({ id: c.id, floor: f.id, x0: c.rect.min.x, y0: c.rect.min.y, x1: c.rect.max.x, y1: c.rect.max.y });
    }
  }
  return out;
}
const sameLevel = (a: string, b: string): boolean => a === b || ["grounds", "ground"].every((x) => [a, b].includes(x)) || ["hill", "upper"].every((x) => [a, b].includes(x));
const gap = (b: Box, x: number, y: number): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));

const centre = (floor: string, id: string): Pos => {
  const r = map.floors.find((f) => f.id === floor)!.rooms.find((x) => x.id === id)!.rect;
  const p = { floor, x: (r.min.x + r.max.x) / 2, y: (r.min.y + r.max.y) / 2 } as Pos;
  for (let d = 0; d < 6; d += 0.25) {
    for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]] as const) {
      const q = { ...p, x: p.x + dx, y: p.y + dy } as Pos;
      if (nav.isWalkable(q)) return q;
    }
  }
  throw new Error(`no walkable point in ${id}`);
};

const ROUTES: [string, [string, string], [string, string]][] = [
  ["helipad to the panic room", ["grounds", "@helipad"], ["ground", "g.panic"]],
  ["helipad to the study", ["grounds", "@helipad"], ["ground", "g.study"]],
  ["foyer to the kitchen", ["ground", "g.foyer"], ["ground", "g.kitchen"]],
  ["foyer to the library", ["ground", "g.foyer"], ["ground", "g.library"]],
  ["foyer to the dining room", ["ground", "g.foyer"], ["ground", "g.dining"]],
  ["foyer to the living room", ["ground", "g.foyer"], ["ground", "g.living"]],
  ["foyer to the son's room", ["ground", "g.foyer"], ["upper", "u.son"]],
  ["foyer to the safe landing", ["ground", "g.foyer"], ["upper", "u.safe"]],
  ["master to the panic room", ["ground", "g.master"], ["ground", "g.panic"]],
  ["panic room to the boathouse", ["ground", "g.panic"], ["shore", "grounds.boathouse"]],
  ["helipad to the garage link", ["grounds", "@helipad"], ["ground", "g.garage-link"]],
];

describe("routes keep the capsule's radius clear of walls and solid cover", () => {
  for (const [name, a, b] of ROUTES) {
    it(name, () => {
      const from = a[1] === "@helipad" ? ({ floor: "grounds", x: 48, y: 68 } as Pos) : centre(...a);
      const path = nav.findPath(from, centre(...b));
      expect(path.length, "route found").toBeGreaterThan(1);
      const boxes = solids();
      const worst: { clear: number; box: string; x: number; y: number; floor: string }[] = [];
      for (let i = 1; i < path.length; i++) {
        const p = path[i - 1]!, q = path[i]!;
        if (p.floor !== q.floor) continue; // a stair or shaft link, not a walk on the mesh
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        const n = Math.max(1, Math.ceil(len / 0.05));
        for (let k = 0; k <= n; k++) {
          const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n;
          for (const b of boxes) {
            if (!sameLevel(b.floor, p.floor)) continue;
            const clear = gap(b, x, y);
            if (clear < RADIUS - TOLERANCE) worst.push({ clear, box: b.id, x, y, floor: p.floor });
          }
        }
      }
      worst.sort((m, n) => m.clear - n.clear);
      const seen = new Set<string>();
      const detail = worst.filter((w) => !seen.has(w.box) && seen.add(w.box)).slice(0, 6).map((w) => `${w.floor} (${w.x.toFixed(2)}, ${w.y.toFixed(2)}) is ${w.clear.toFixed(2)} m from ${w.box}`);
      expect(detail).toEqual([]);
    });
  }
});
