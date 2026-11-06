import { COVER_SEEK_CM, COVER_STAND_OFF_CM } from "../defaults";
import type { Entity, EntityPos } from "../world";
import type { Ctx } from "./context";
import { coverAt } from "./combat";

function dist2(a: EntityPos, b: EntityPos): number {
  const dx = a.xCm - b.xCm, dy = a.yCm - b.yCm;
  return dx * dx + dy * dy;
}

/**
 * Where should this unit stand to be covered from fire coming from `threat`? `"covered"` when it already is (or the
 * threat is on another floor), a spot when there is a better place within COVER_SEEK_CM, or undefined when there is none.
 * A spot is a point COVER_STAND_OFF_CM outside a heavy or light cover rectangle that blocks fire from the threat's side;
 * heavy before light, then the nearest, skipping spots within 1 m of one in `taken`. Ties go to the first found (map order,
 * then north, south, east, west of the rectangle).
 */
export function findCover(ctx: Ctx, e: Entity, threat: EntityPos, taken: readonly EntityPos[]): "covered" | { xCm: number; yCm: number } | undefined {
  if (threat.floor !== e.pos.floor) return "covered";
  if (coverAt(ctx, e.pos.floor, e.pos.xCm, e.pos.yCm, threat.xCm, threat.yCm) < 1000) return "covered";
  const reach2 = COVER_SEEK_CM * COVER_SEEK_CM;
  let best: { xCm: number; yCm: number; heavy: number; d2: number } | undefined;
  for (const c of ctx.sight?.cover() ?? []) {
    if (c.floor !== e.pos.floor) continue;
    const mx = Math.trunc((c.x0 + c.x1) / 2), my = Math.trunc((c.y0 + c.y1) / 2), o = COVER_STAND_OFF_CM;
    for (const [px, py] of [[mx, c.y1 + o], [mx, c.y0 - o], [c.x1 + o, my], [c.x0 - o, my]] as const) {
      const spot = { floor: e.pos.floor, xCm: px, yCm: py };
      const d2 = dist2(e.pos, spot);
      if (d2 > reach2) continue;
      if (coverAt(ctx, e.pos.floor, px, py, threat.xCm, threat.yCm) >= 1000) continue;
      if (taken.some((t) => t.floor === e.pos.floor && dist2(t, spot) < 100 * 100)) continue;
      const heavy = c.kind === "heavy" ? 0 : 1;
      if (!best || heavy < best.heavy || (heavy === best.heavy && d2 < best.d2)) best = { xCm: px, yCm: py, heavy, d2 };
    }
  }
  return best ? { xCm: best.xCm, yCm: best.yCm } : undefined;
}
