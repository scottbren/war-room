import type { Floor, MapFile } from "@war-room/content";

/**
 * Triangle soup for the navmesh baker. Recast axes: x = map x, y = height (floor elevation), z = map y.
 * Floors are flat, upward-facing slabs; walls and solid cover are blocks with vertical sides and a downward-facing lid (nothing can be
 * walked on top of them, and the floor inside or under them is not walkable). Windows are closed with a thin blocker; doors stay as the gaps the
 * walls already have.
 */
export type OffMeshLink = { id: string; start: [number, number, number]; end: [number, number, number]; bidirectional: boolean };
export type NavGeometry = { positions: number[]; indices: number[]; offMesh: OffMeshLink[] };

type Rect = { min: { x: number; y: number }; max: { x: number; y: number } };

const CLOSED_WINDOW_HEIGHT = 3;
/** Cover this low can be stepped over (the agent climbs 0.4 m), so it is not an obstacle. */
const MAX_STEP_OVER = 0.4;
/** Walls and cover stop just short of the floor above so they cannot leak into its walkable layer. */
const STOREY_CAP = 3.8;

function subtract(rect: Rect, hole: Rect): Rect[] {
  const ix0 = Math.max(rect.min.x, hole.min.x), ix1 = Math.min(rect.max.x, hole.max.x);
  const iy0 = Math.max(rect.min.y, hole.min.y), iy1 = Math.min(rect.max.y, hole.max.y);
  if (ix0 >= ix1 || iy0 >= iy1) return [rect];
  const out: Rect[] = [];
  if (rect.min.y < iy0) out.push({ min: { x: rect.min.x, y: rect.min.y }, max: { x: rect.max.x, y: iy0 } });
  if (iy1 < rect.max.y) out.push({ min: { x: rect.min.x, y: iy1 }, max: { x: rect.max.x, y: rect.max.y } });
  if (rect.min.x < ix0) out.push({ min: { x: rect.min.x, y: iy0 }, max: { x: ix0, y: iy1 } });
  if (ix1 < rect.max.x) out.push({ min: { x: ix1, y: iy0 }, max: { x: rect.max.x, y: iy1 } });
  return out;
}

class Soup {
  positions: number[] = [];
  indices: number[] = [];
  private vertex(x: number, y: number, z: number): number {
    this.positions.push(x, y, z);
    return this.positions.length / 3 - 1;
  }
  /** Upward-facing horizontal quad. */
  slab(r: Rect, h: number): void {
    const a = this.vertex(r.min.x, h, r.min.y), b = this.vertex(r.max.x, h, r.min.y);
    const c = this.vertex(r.max.x, h, r.max.y), d = this.vertex(r.min.x, h, r.max.y);
    this.indices.push(a, c, b, a, d, c);
  }
  /**
   * A solid block: four vertical side faces plus a downward-facing lid. The lid is not walkable (it faces down),
   * but it caps the space under it, so floor inside a block, or under low cover, has no headroom and is not walkable.
   */
  walls(r: Rect, bottom: number, top: number): void {
    const p = [[r.min.x, r.min.y], [r.max.x, r.min.y], [r.max.x, r.max.y], [r.min.x, r.max.y]] as const;
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = p[i]!, [x1, z1] = p[(i + 1) % 4]!;
      const a = this.vertex(x0, bottom, z0), b = this.vertex(x1, bottom, z1);
      const c = this.vertex(x1, top, z1), d = this.vertex(x0, top, z0);
      this.indices.push(a, b, c, a, c, d);
    }
    const a = this.vertex(r.min.x, top, r.min.y), b = this.vertex(r.max.x, top, r.min.y);
    const c = this.vertex(r.max.x, top, r.max.y), d = this.vertex(r.min.x, top, r.max.y);
    this.indices.push(a, b, c, a, c, d);
  }
}

/** Along its length a wall runs exactly from a to b (so a door gap keeps its full width); across it, half the thickness each side. */
function wallRect(w: Floor["walls"][number]): Rect {
  const t = w.thickness / 2;
  const horizontal = w.a.y === w.b.y;
  const vertical = w.a.x === w.b.x;
  const ex = vertical || !horizontal ? t : 0;
  const ey = horizontal || !vertical ? t : 0;
  return {
    min: { x: Math.min(w.a.x, w.b.x) - ex, y: Math.min(w.a.y, w.b.y) - ey },
    max: { x: Math.max(w.a.x, w.b.x) + ex, y: Math.max(w.a.y, w.b.y) + ey },
  };
}

/** A window closes the gap in the wall it sits in: horizontal wall if wall ends meet it along x, else vertical. */
function windowBlocker(floor: Floor, win: Floor["windows"][number]): Rect {
  const half = win.width / 2;
  const near = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) < 0.06 && Math.abs(p.y - y) < 0.06;
  const ends = floor.walls.flatMap((w) => [w.a, w.b]);
  const horizontal = ends.some((p) => near(p, win.at.x - half, win.at.y) || near(p, win.at.x + half, win.at.y));
  return horizontal
    ? { min: { x: win.at.x - half, y: win.at.y - 0.15 }, max: { x: win.at.x + half, y: win.at.y + 0.15 } }
    : { min: { x: win.at.x - 0.15, y: win.at.y - half }, max: { x: win.at.x + 0.15, y: win.at.y + half } };
}

export function buildNavGeometry(map: MapFile): NavGeometry {
  const soup = new Soup();
  const elevation = new Map(map.floors.map((f) => [f.id, f.elevation]));
  for (const floor of [...map.floors].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const h = floor.elevation;
    const holes = floor.openings.map((o) => o.rect);

    // Walkable surfaces: rooms (except voids), plus open ground, beach and neighbor lawns that have no rooms.
    const surfaces: Rect[] = floor.rooms.filter((r) => !r.tags.includes("void")).map((r) => r.rect);
    if (floor.id === "grounds") surfaces.push({ min: { x: map.bounds.min.x, y: 0 }, max: { x: map.bounds.max.x, y: map.bounds.max.y } });
    if (floor.id === "shore") surfaces.push({ min: { x: 0, y: -12 }, max: { x: 100, y: 0 } });
    if (floor.id === "hill") {
      for (const z of map.zones.filter((zone) => zone.floor === "hill")) surfaces.push(z.rect);
    }
    for (const s of surfaces) {
      let pieces: Rect[] = [s];
      for (const hole of holes) pieces = pieces.flatMap((p) => subtract(p, hole));
      for (const p of pieces) soup.slab(p, h);
    }

    const cap = floor.id === "roof" ? Infinity : STOREY_CAP;
    for (const w of floor.walls) soup.walls(wallRect(w), h, h + Math.min(w.height, cap));
    for (const win of floor.windows) soup.walls(windowBlocker(floor, win), h, h + CLOSED_WINDOW_HEIGHT);
    for (const c of floor.cover) {
      if (c.type === "concealment") continue; // hedges and trees can be walked through
      if (c.height <= MAX_STEP_OVER) continue; // pool edges, kerbs and rugs are stepped over
      soup.walls(c.rect, h, h + Math.min(c.height, cap));
    }
  }

  const offMesh: OffMeshLink[] = map.verticalLinks.map((l) => ({
    id: l.id,
    start: [l.from.at.x, elevation.get(l.from.floor)!, l.from.at.y],
    end: [l.to.at.x, elevation.get(l.to.floor)!, l.to.at.y],
    bidirectional: l.bidirectional,
  }));
  return { positions: soup.positions, indices: soup.indices, offMesh };
}
