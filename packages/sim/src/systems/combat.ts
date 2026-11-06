import { DAMAGE_MAX, DAMAGE_MIN, FIRE_INTERVAL_TICKS, HIT_BANDS, POINT_BLANK_CM, SHOT_NOISE_CM } from "../defaults";
import { fromCm } from "../quantize";
import { angleBetween } from "../trig";
import { sortedIds } from "../world";
import type { Entity } from "../world";
import type { System } from "./context";
import { deliverSounds } from "./hearing";
import type { Sound } from "./hearing";
import { isqrt } from "./movement";

/** Hit chance in per mille at this distance, or 0 beyond the last band. */
export function hitChance(distCm: number): number {
  for (const [farthest, chance] of HIT_BANDS) if (distCm <= farthest) return chance;
  return 0;
}

/**
 * Combat, first slice: units shoot at enemies they can see right now (the sight memory `world.sight`). Operators fire at
 * defenders; defenders fire at operators. Both hold fire until the fight is on: a defender fires once it is alerted or
 * when an operator is at point-blank range (10 m); an operator fires only at a defender that is alerted or already
 * firing. Nobody fires at family, the principal or civilians. A unit with a target stands still and fires one shot per FIRE_INTERVAL_TICKS at the closest one (ties
 * by id); each shot costs one PRNG draw for the hit and, on a hit, one for the damage, in unit id order. A hit is
 * applied at once, so a unit downed earlier in the tick is not shot at again. Health at zero downs a unit.
 * A shot is a loud noise, delivered at once to everyone in earshot. No cover, suppression or darkness yet.
 */
export const combatSystem: System = (world, ctx) => {
  const ids = sortedIds(world);
  const sounds: Sound[] = [];

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
    const hit = ctx.rng.int(0, 999) < hitChance(isqrt(dx * dx + dy * dy));
    const at = { floor: target.pos.floor, x: fromCm(target.pos.xCm), y: fromCm(target.pos.yCm) };
    ctx.emit({ type: "shot", shooter: id, at, hit });
    sounds.push({ kind: "shot", at: { floor: u.pos.floor, x: fromCm(u.pos.xCm), y: fromCm(u.pos.yCm) }, radiusCm: SHOT_NOISE_CM, source: u });
    if (hit) {
      target.health = Math.max(0, target.health - ctx.rng.int(DAMAGE_MIN, DAMAGE_MAX));
      if (target.health === 0) {
        target.state = "down";
        delete target.motion;
        delete target.reload;
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
function pickTarget(world: Parameters<System>[0], ids: string[], u: Entity): Entity | undefined {
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
    const hot = u.side === "defender" ? alerted(u) || d2 <= POINT_BLANK_CM * POINT_BLANK_CM : alerted(t);
    if (!hot) continue;
    if (hitChance(isqrt(d2)) === 0) continue;
    if (d2 < bestD2) {
      best = t;
      bestD2 = d2;
    }
  }
  return best;
}
