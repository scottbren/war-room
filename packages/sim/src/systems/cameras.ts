import { CAMERA_RANGE_CM, SIGHT_CHECK_EVERY } from "../defaults";
import { effectiveRange } from "../los";
import { fromCm } from "../quantize";
import { sortedIds } from "../world";
import type { Entity, EntityPos, World } from "../world";
import type { Ctx } from "./context";
import { hubOnline } from "./smart-home";

/**
 * Cameras as sensors for the defenders. A camera that is `on` (not off, not looped on old footage), while a hub is
 * online to carry the feed, sees an operator when it has line of sight, the operator is inside one of the rooms it
 * watches (an indoor camera) or within its range (an outdoor one), and he is within CAMERA_RANGE_CM (halved if he is
 * concealed). Each camera checks on the same staggered schedule as sight. Returns where operators were seen this tick;
 * the defenders' minds turn those into security-office reports (see mind.ts). Cameras have no facing; the rooms and the
 * range are their field of view. Looping a camera, switching it off or taking the hub down blinds the house.
 */
export function cameraSystem(world: World, ctx: Ctx): EntityPos[] {
  const env = ctx.sight;
  if (!env) return [];
  const cameras = env.cameras();
  if (cameras.length === 0 || !hubOnline(world)) return [];
  // Nothing to do while no camera works (off or looped): skip the sight setup, as before the feeds existed.
  if (!cameras.some((c) => world.devices[c.id]?.kind === "camera" && world.devices[c.id]?.state === "on")) return [];
  const ids = sortedIds(world);
  // Operators (standing) are what the defenders are told about; everyone else (even a body) is what a tapped feed shows the President.
  const all = ids.map((id) => world.entities[id] as Entity);
  const targets = all.filter((e) => e.side === "operator" ? e.state !== "down" : true);
  if (targets.length === 0) return [];
  env.syncWorld(world.doors, world.shutters);
  const los = env.los();

  const seen: EntityPos[] = [];
  cameras.forEach((cam, i) => {
    if (world.devices[cam.id]?.kind !== "camera" || world.devices[cam.id]?.state !== "on" || (ctx.tick + i) % SIGHT_CHECK_EVERY !== 0) return;
    for (const t of targets) {
      const x = fromCm(t.pos.xCm), y = fromCm(t.pos.yCm);
      if (cam.rooms.length > 0 && !cam.rooms.some((r) => r.floor === t.pos.floor && x >= r.minX && x < r.maxX && y >= r.minY && y < r.maxY)) continue;
      const sight = los.sight(cam.at, { floor: t.pos.floor, x, y });
      if (!sight.visible) continue;
      const dx = t.pos.xCm - Math.round(cam.at.x * 100), dy = t.pos.yCm - Math.round(cam.at.y * 100);
      const range = effectiveRange(CAMERA_RANGE_CM, sight.concealed);
      if (dx * dx + dy * dy > range * range) continue;
      if (t.side === "operator") seen.push({ ...t.pos });
      else ctx.emit({ type: "camera", device: cam.id, target: t.id });
    }
  });
  return seen;
}
