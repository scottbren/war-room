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
 * Moves each entity toward its current target in a straight line, in integer centimeters. A navmesh route is a
 * list of such targets (`motion.rest`): on reaching one the unit takes the next. A target on another floor (a
 * stair or ladder link) is walked toward on the current floor, and the unit changes floor on arrival.
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
      if (m.toFloor !== undefined) e.pos.floor = m.toFloor;
      const next = m.rest?.[0];
      if (next) {
        m.toXCm = next.xCm;
        m.toYCm = next.yCm;
        m.toFloor = next.floor;
        if (m.rest!.length > 1) m.rest = m.rest!.slice(1);
        else delete m.rest;
      } else {
        e.state = "idle";
        delete e.motion;
      }
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
    if (arrives && !e.motion) ctx.emit({ type: "arrived", entity: e.id });
  }
};
