import type { FloorId } from "@war-room/content";
import type { Pos } from "@war-room/sim";

/** A pick ray in Babylon axes: x east, y up, z = map y (north). */
export interface PickRay {
  origin: readonly [number, number, number];
  direction: readonly [number, number, number];
}

/**
 * Where a click ray meets each visible floor plane, nearest to the camera first. The caller keeps the first
 * one that is actually walkable (a roof candidate is skipped where there is no roof).
 */
export function floorCandidates(ray: PickRay, visible: readonly FloorId[], elevations: Readonly<Record<FloorId, number>>): Pos[] {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (dy === 0) return [];
  const hits: { t: number; order: number; pos: Pos }[] = [];
  visible.forEach((floor, order) => {
    const t = (elevations[floor] - oy) / dy;
    if (!(t > 0)) return;
    hits.push({ t, order, pos: { floor, x: Math.round((ox + t * dx) * 100) / 100, y: Math.round((oz + t * dz) * 100) / 100 } });
  });
  // Nearest first; floors at the same height keep the caller's order.
  return hits.sort((a, b) => a.t - b.t || a.order - b.order).map((h) => h.pos);
}
