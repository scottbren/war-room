import type { MapFile } from "@war-room/content";
import type { Pos } from "../types";
import { hearingSystem } from "./hearing";
import { canObserve } from "./observe";
import { CONTACT_REFRESH_TICKS, SIGHT_CHECK_EVERY, SIGHT_RANGE_CM } from "../defaults";
import { createLos, effectiveRange } from "../los";
import type { Los } from "../los";
import { fromCm } from "../quantize";
import { sortedIds } from "../world";
import type { Entity } from "../world";
import type { System } from "./context";

/**
 * Line of sight for one sim: built on first use (so sims that never need it do not pay for it) and kept in step with
 * the world's doors and shutters. Not part of the saved state; rebuilt from the world after a restore.
 */
export interface SightEnv {
  los(): Los;
  /** Where a door is (meters), for sounds made at it. */
  doorPos(doorId: string): Pos | undefined;
  /** Forget which door and shutter states were pushed into the line-of-sight grid (after a restore). */
  reset(): void;
  syncWorld(doors: Readonly<Record<string, string>>, shutters: Readonly<Record<string, string>>): void;
}

export function createSightEnv(map: MapFile): SightEnv {
  let los: Los | undefined;
  let doors: Record<string, string> = {};
  let shutters: Record<string, string> = {};
  const get = (): Los => (los ??= createLos(map));
  const doorAt = new Map<string, Pos>();
  for (const f of map.floors) for (const d of f.doors) doorAt.set(d.id, { floor: f.id, x: d.at.x, y: d.at.y });
  return {
    los: get,
    doorPos: (id) => doorAt.get(id),
    reset() {
      doors = {};
      shutters = {};
    },
    syncWorld(nowDoors, nowShutters) {
      const l = get();
      for (const id of Object.keys(nowDoors).sort()) {
        if (doors[id] !== nowDoors[id]) {
          l.setDoor(id, nowDoors[id] as "open" | "closed" | "locked");
          doors[id] = nowDoors[id] as string;
        }
      }
      for (const id of Object.keys(nowShutters).sort()) {
        if (shutters[id] !== nowShutters[id]) {
          l.setShutter(id, nowShutters[id] as "open" | "closed");
          shutters[id] = nowShutters[id] as string;
        }
      }
    },
  };
}

/**
 * Perception: each observer checks line of sight to its possible targets every SIGHT_CHECK_EVERY ticks (staggered by
 * the unit's place in id order). A sighting emits a `contact` event at once, then repeats it every
 * CONTACT_REFRESH_TICKS while the target stays in view, so the knowledge layer can tell "in view now" from "last seen".
 * Losing sight emits nothing; the next sighting is a fresh contact. Distance is integer squared centimeters (no sqrt).
 * Facing and field of view are not used yet.
 */
export const perceptionSystem: System = (world, ctx) => {
  sightSystem(world, ctx);
  hearingSystem(world, ctx);
};

const sightSystem: System = (world, ctx) => {
  const env = ctx.sight;
  if (!env) return;
  const ids = sortedIds(world);
  const observers = ids.filter((id) => {
    const e = world.entities[id] as Entity;
    return (e.side === "operator" || e.side === "defender") && e.state !== "down";
  });
  // Forget pairs whose observer is down or gone; nothing would ever clear them otherwise.
  const watching = new Set(observers);
  for (const key of Object.keys(world.sight).sort()) {
    const from = key.slice(0, key.indexOf(">"));
    if (!watching.has(from)) delete world.sight[key];
  }
  if (observers.length === 0) return;
  env.syncWorld(world.doors, world.shutters);
  const los = env.los();

  observers.forEach((oid) => {
    // The phase is the unit's place among all units, not among the living observers, so it never shifts when someone goes down.
    if ((ctx.tick + ids.indexOf(oid)) % SIGHT_CHECK_EVERY !== 0) return;
    const o = world.entities[oid] as Entity;
    const from = { floor: o.pos.floor, x: fromCm(o.pos.xCm), y: fromCm(o.pos.yCm) };
    for (const tid of ids) {
      const t = world.entities[tid] as Entity;
      if (tid === oid || !canObserve(o.side, t.side)) continue;
      const key = `${oid}>${tid}`;
      const sight = los.sight(from, { floor: t.pos.floor, x: fromCm(t.pos.xCm), y: fromCm(t.pos.yCm) });
      const range = effectiveRange(SIGHT_RANGE_CM, sight.concealed);
      const dx = t.pos.xCm - o.pos.xCm, dy = t.pos.yCm - o.pos.yCm;
      if (sight.visible && dx * dx + dy * dy <= range * range) {
        const last = world.sight[key];
        if (last === undefined || ctx.tick - last >= CONTACT_REFRESH_TICKS) {
          ctx.emit({ type: "contact", observer: oid, target: tid });
          world.sight[key] = ctx.tick;
        }
      } else {
        delete world.sight[key];
      }
    }
  });
};
