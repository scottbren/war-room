import { fromCm } from "../quantize";
import { angleBetween } from "../trig";
import { sortedEntities } from "../world";
import type { System } from "./context";

/** Integer square root (floor), exact for all safe integers. */
export function isqrt(n: number): number {
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/**
 * Straight-line movement toward each entity's target, in integer centimeters.
 * (The navmesh replaces the straight line in T8/T10.)
 */
export const movementSystem: System = (world, ctx) => {
  for (const e of sortedEntities(world)) {
    const m = e.motion;
    if (!m) continue;

    const dx = m.toXCm - e.pos.xCm;
    const dy = m.toYCm - e.pos.yCm;
    const dist = isqrt(dx * dx + dy * dy);

    if (dist > 0) {
      e.facing = angleBetween(
        { x: fromCm(e.pos.xCm), y: fromCm(e.pos.yCm) },
        { x: fromCm(m.toXCm), y: fromCm(m.toYCm) },
      );
    }

    const arrives = dist <= m.speedCmPerTick;
    if (arrives) {
      e.pos.xCm = m.toXCm;
      e.pos.yCm = m.toYCm;
      e.state = "idle";
      delete e.motion;
    } else {
      e.pos.xCm += Math.trunc((dx * m.speedCmPerTick) / dist);
      e.pos.yCm += Math.trunc((dy * m.speedCmPerTick) / dist);
      e.state = "moving";
    }

    if (dist > 0) {
      ctx.emit({
        type: "moved",
        entity: e.id,
        to: { floor: e.pos.floor, x: fromCm(e.pos.xCm), y: fromCm(e.pos.yCm) },
      });
    }
    if (arrives) ctx.emit({ type: "arrived", entity: e.id });
  }
};
