import {
  COVER_REACH_CM, DAMAGE_MAX, DAMAGE_MIN, FIRE_INTERVAL_TICKS, HEAVY_COVER_PM, HIT_BANDS, LIGHT_COVER_PM, MOVING_TARGET_PM,
  PINNED_AT, POINT_BLANK_CM, SHOT_NOISE_CM, SUPPRESSED_AIM, SUPPRESS_HIT, SUPPRESS_MAX, SUPPRESS_NEAR, SUPPRESS_RADIUS_CM,
} from "../defaults";
import { fromCm } from "../quantize";
import { angleBetween } from "../trig";
import { sortedIds } from "../world";
import type { Entity, World } from "../world";
import type { System } from "./context";
import { deliverSounds } from "./hearing";
import type { Sound } from "./hearing";
import { isqrt } from "./movement";

/** Hit chance in per mille at this distance, or 0 beyond the last band. */
export function hitChance(distCm: number): number {
  for (const [farthest, chance] of HIT_BANDS) if (distCm <= farthest) return chance;
  return 0;
}

/** Hit-chance multiplier in per mille for someone at (tx, ty) against fire from (sx, sy): the best cover within reach that lies on the shooter's side. */
export function coverAt(ctx: Parameters<System>[1], floor: string, tx: number, ty: number, sx: number, sy: number): number {
  let best = 1000;
  for (const c of ctx.sight?.cover() ?? []) {
    if (c.floor !== floor) continue;
    const nx = Math.min(Math.max(tx, c.x0), c.x1), ny = Math.min(Math.max(ty, c.y0), c.y1);
    const vx = nx - tx, vy = ny - ty;
    if (vx * vx + vy * vy > COVER_REACH_CM * COVER_REACH_CM) continue;
    // On the shooter's side: the way to the cover points toward the shooter (standing inside it counts).
    const inside = vx === 0 && vy === 0;
    if (!inside && (sx - tx) * vx + (sy - ty) * vy <= 0) continue;
    best = Math.min(best, c.kind === "heavy" ? HEAVY_COVER_PM : LIGHT_COVER_PM);
  }
  return best;
}

export function coverMultiplier(ctx: Parameters<System>[1], shooter: Entity, target: Entity): number {
  return coverAt(ctx, target.pos.floor, target.pos.xCm, target.pos.yCm, shooter.pos.xCm, shooter.pos.yCm);
}

/** Final hit chance in per mille: range band, then cover, a moving target, and a suppressed shooter. */
function aimedChance(world: World, ctx: Parameters<System>[1], shooter: Entity, target: Entity, distCm: number): number {
  let chance = hitChance(distCm);
  chance = Math.trunc((chance * coverMultiplier(ctx, shooter, target)) / 1000);
  if (target.motion !== undefined && target.state !== "firing" && (world.suppression[target.id] ?? 0) < PINNED_AT) chance = Math.trunc((chance * MOVING_TARGET_PM) / 1000);
  const s = world.suppression[shooter.id] ?? 0;
  for (const [from, pm] of SUPPRESSED_AIM) {
    if (s >= from) {
      chance = Math.trunc((chance * pm) / 1000);
      break;
    }
  }
  return chance;
}

/** Adds suppression to every unit of the target's side within 2 m of the shot's path (the target more when hit). */
function suppress(world: World, ids: string[], shooter: Entity, target: Entity, hit: boolean): void {
  const ax = shooter.pos.xCm, ay = shooter.pos.yCm;
  const dx = target.pos.xCm - ax, dy = target.pos.yCm - ay;
  const len2 = dx * dx + dy * dy;
  const r2 = SUPPRESS_RADIUS_CM * SUPPRESS_RADIUS_CM;
  for (const id of ids) {
    const u = world.entities[id] as Entity;
    if (u.side !== target.side || u.state === "down" || u.pos.floor !== target.pos.floor) continue;
    let add = 0;
    if (id === target.id) add = hit ? SUPPRESS_HIT : SUPPRESS_NEAR;
    else if (len2 > 0) {
      const px = u.pos.xCm - ax, py = u.pos.yCm - ay;
      const along = px * dx + py * dy; // 0..len2 means abreast of the path
      const cross = px * dy - py * dx;
      if (along >= 0 && along <= len2 && cross * cross <= r2 * len2) add = SUPPRESS_NEAR;
    }
    if (add > 0) world.suppression[id] = Math.min(SUPPRESS_MAX, (world.suppression[id] ?? 0) + add);
  }
}

/**
 * Combat, first slice: units shoot at enemies they can see right now (the sight memory `world.sight`). Operators fire at
 * defenders; defenders fire at operators. Both hold fire until the fight is on: a defender fires once it is alerted or
 * when an operator is at point-blank range (10 m); an operator fires only at a defender that is alerted or already
 * firing. Nobody fires at family, the principal or civilians. A unit with a target stands still and fires one shot per FIRE_INTERVAL_TICKS at the closest one (ties
 * by id); each shot costs one PRNG draw for the hit and, on a hit, one for the damage, in unit id order. A hit is
 * applied at once, so a unit downed earlier in the tick is not shot at again. Health at zero downs a unit.
 * A shot is a loud noise, delivered at once to everyone in earshot. Hit chance is the range band times cover (heavy
 * 50%, light 75%, directional cover counts as all-round), a moving target (75%) and the shooter's own suppression
 * (60% at 50+, 40% at 80+). A shot passing within 2 m of an enemy unit suppresses it (+10, +25 on the target when it
 * hits; capped at 100, decays 1 per tick); a unit at 80+ is pinned and does not advance. No darkness yet.
 */
export const combatSystem: System = (world, ctx) => {
  const ids = sortedIds(world);
  const sounds: Sound[] = [];

  for (const id of Object.keys(world.suppression).sort()) {
    const v = (world.suppression[id] as number) - 1;
    if (v <= 0 || (world.entities[id] as Entity).state === "down") delete world.suppression[id];
    else world.suppression[id] = v;
  }

  for (const id of ids) {
    const u = world.entities[id] as Entity;
    if (u.state === "down") continue;
    if (u.reload !== undefined && ctx.tick >= u.reload) delete u.reload;
    const target = pickTarget(world, ids, u);
    if (!target) {
      if (u.state === "firing") u.state = u.motion ? "moving" : "idle";
      continue;
    }
    u.state = "firing";
    if (u.reload !== undefined) continue; // still cooling down between shots
    u.reload = ctx.tick + FIRE_INTERVAL_TICKS;

    const dx = target.pos.xCm - u.pos.xCm, dy = target.pos.yCm - u.pos.yCm;
    u.facing = angleBetween({ x: fromCm(u.pos.xCm), y: fromCm(u.pos.yCm) }, { x: fromCm(target.pos.xCm), y: fromCm(target.pos.yCm) });
    const hit = ctx.rng.int(0, 999) < aimedChance(world, ctx, u, target, isqrt(dx * dx + dy * dy));
    const at = { floor: target.pos.floor, x: fromCm(target.pos.xCm), y: fromCm(target.pos.yCm) };
    ctx.emit({ type: "shot", shooter: id, at, hit });
    sounds.push({ kind: "shot", at: { floor: u.pos.floor, x: fromCm(u.pos.xCm), y: fromCm(u.pos.yCm) }, radiusCm: SHOT_NOISE_CM, source: u });
    suppress(world, ids, u, target, hit);
    if (hit) {
      target.health = Math.max(0, target.health - ctx.rng.int(DAMAGE_MIN, DAMAGE_MAX));
      if (target.health === 0) {
        target.state = "down";
        delete target.motion;
        delete target.reload;
        delete world.suppression[target.id];
        ctx.emit({ type: "down", entity: target.id });
      }
    }
  }

  // A unit whose target went down this tick (or whose target was taken by someone else) does not stay in the firing
  // stance for another tick.
  for (const id of ids) {
    const u = world.entities[id] as Entity;
    if (u.state === "firing" && !pickTarget(world, ids, u)) u.state = u.motion ? "moving" : "idle";
  }

  deliverSounds(world, ctx, sounds);
};

/** The closest enemy this unit may and can shoot at right now, or undefined. */
function pickTarget(world: World, ids: string[], u: Entity): Entity | undefined {
  if (u.side !== "operator" && u.side !== "defender") return undefined;
  const wantedSide = u.side === "operator" ? "defender" : "operator";
  const alerted = (e: Entity): boolean => e.state === "firing" || world.minds[e.id]?.mode === "alerted";
  let best: Entity | undefined;
  let bestD2 = Infinity;
  for (const tid of ids) {
    if (world.sight[`${u.id}>${tid}`] === undefined) continue;
    const t = world.entities[tid] as Entity;
    if (t.side !== wantedSide || t.state === "down") continue;
    const dx = t.pos.xCm - u.pos.xCm, dy = t.pos.yCm - u.pos.yCm;
    const d2 = dx * dx + dy * dy;
    // Both sides hold fire until the fight is on. A defender fires once it is alerted, or when an operator is at
    // point-blank range. An operator keeps a covert approach and fires only at a defender that is alerted or firing.
    // A defender running for cover or falling back does not stop to shoot, unless an operator is at point-blank range.
    const m = world.minds[u.id];
    if (u.side === "defender" && u.motion !== undefined && m?.mode === "alerted" && (m.cover !== undefined || m.fallback) && d2 > POINT_BLANK_CM * POINT_BLANK_CM) continue;
    if (u.side === "operator" && u.motion !== undefined && world.opCover[u.id] !== undefined && d2 > POINT_BLANK_CM * POINT_BLANK_CM) continue; // running for cover
    const hot = u.side === "defender" ? alerted(u) || d2 <= POINT_BLANK_CM * POINT_BLANK_CM : world.roe === "free" || (world.roe === "return" && alerted(t));
    if (!hot) continue;
    if (hitChance(isqrt(d2)) === 0) continue;
    if (d2 < bestD2) {
      best = t;
      bestD2 = d2;
    }
  }
  return best;
}
