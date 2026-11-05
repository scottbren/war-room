import { DEFAULT_SPEED_CM_PER_TICK, DOOR_NOISE_CM, HEAR_EVERY, MUFFLE_FLOOR_DIV, MUFFLE_WALL_DIV, STEP_NOISE_FACTOR } from "../defaults";
import { fromCm, toCm } from "../quantize";
import type { Pos } from "../types";
import { sortedIds } from "../world";
import type { Entity } from "../world";
import type { Ctx, System } from "./context";
import { isqrt } from "./movement";
import { canObserve } from "./observe";

interface Sound {
  kind: "steps" | "door";
  at: Pos;
  radiusCm: number;
  /** Who made it, so they do not hear themselves, and which side's ears care. Doors have no side. */
  source?: Entity;
}

/**
 * Hearing: sounds made this tick are carried to every living operator and defender who could plausibly notice them.
 * Footsteps come from units that moved this tick (heard on a staggered schedule, so a walker is heard about every
 * HEAR_EVERY ticks); a door changing state is heard at once. A sound with no line of sight to the listener carries
 * half as far, one on another floor a third. The listener gets an approximate spot, wrong by up to a quarter of the
 * distance, drawn from the seeded PRNG; it is never told who made the sound. Stateless: nothing is saved.
 */
export const hearingSystem: System = (world, ctx) => {
  const env = ctx.sight;
  if (!env) return;
  const sounds = collect(world.entities, ctx, env.doorPos);
  if (sounds.length === 0) return;
  const ids = sortedIds(world);
  const listeners = ids.filter((id) => {
    const e = world.entities[id] as Entity;
    return (e.side === "operator" || e.side === "defender") && e.state !== "down";
  });
  if (listeners.length === 0) return;
  env.syncWorld(world.doors, world.shutters);
  const los = env.los();

  for (const sound of sounds) {
    for (const lid of listeners) {
      const l = world.entities[lid] as Entity;
      if (sound.source === l) continue;
      if (sound.source && !canObserve(l.side, sound.source.side)) continue;
      if (sound.kind === "steps" && (ctx.tick + ids.indexOf(lid)) % HEAR_EVERY !== 0) continue;
      const sx = toCm(sound.at.x), sy = toCm(sound.at.y);
      const dx = sx - l.pos.xCm, dy = sy - l.pos.yCm;
      const d2 = dx * dx + dy * dy;
      let reach = sound.radiusCm;
      const clear = los.sight({ floor: l.pos.floor, x: fromCm(l.pos.xCm), y: fromCm(l.pos.yCm) }, sound.at).visible;
      if (!clear) reach = Math.trunc(reach / (l.pos.floor === sound.at.floor ? MUFFLE_WALL_DIV : MUFFLE_FLOOR_DIV));
      if (d2 > reach * reach) continue;
      const err = Math.trunc(isqrt(d2) / 4);
      const ex = err > 0 ? ctx.rng.int(-err, err) : 0;
      const ey = err > 0 ? ctx.rng.int(-err, err) : 0;
      ctx.emit({ type: "noise", observer: lid, kind: sound.kind, at: { floor: sound.at.floor, x: fromCm(sx + ex), y: fromCm(sy + ey) } });
    }
  }
};

/** Sounds made this tick, in a fixed order: footsteps by entity id, then doors in event order. */
function collect(entities: Record<string, Entity>, ctx: Ctx, doorPos: (id: string) => Pos | undefined): Sound[] {
  const sounds: Sound[] = [];
  const moved = new Set<string>();
  for (const ev of ctx.events) if (ev.type === "moved") moved.add(ev.entity);
  for (const id of [...moved].sort()) {
    const e = entities[id];
    if (!e || e.state === "down") continue; // a downed unit makes no footsteps
    sounds.push({
      kind: "steps",
      at: { floor: e.pos.floor, x: fromCm(e.pos.xCm), y: fromCm(e.pos.yCm) },
      radiusCm: DEFAULT_SPEED_CM_PER_TICK[e.side] * STEP_NOISE_FACTOR,
      source: e,
    });
  }
  for (const ev of ctx.events) {
    if (ev.type !== "door") continue;
    const at = doorPos(ev.doorId);
    if (at) sounds.push({ kind: "door", at, radiusCm: DOOR_NOISE_CM });
  }
  return sounds;
}
