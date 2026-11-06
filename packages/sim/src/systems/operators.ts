import { fromCm } from "../quantize";
import { sortedIds } from "../world";
import type { Entity, EntityPos } from "../world";
import type { System } from "./context";
import { startMove } from "./commands";
import { findCover } from "./cover";

/**
 * Operator behavior between orders (the `ai` slot, so it acts on last tick's sight and suppression). An operator that
 * is standing still and comes under fire (suppressed) while it sees a defender takes the best cover near it against
 * that defender, once per fight. An operator with a move order keeps to its order: the player decides where it goes.
 * A move order also cancels the cover choice (see commands). The choice ends when the fight does: no suppression and
 * no defender in view. Firing is handled by combat (an operator does not stop to shoot while it runs for cover).
 */
export const operatorSystem: System = (world, ctx) => {
  const ids = sortedIds(world);
  for (const id of ids) {
    const e = world.entities[id] as Entity;
    if (e.side !== "operator" || e.state === "down") {
      delete world.opCover[id];
      continue;
    }
    const suppressed = (world.suppression[id] ?? 0) > 0;
    let threat: Entity | undefined;
    let threatD2 = Infinity;
    for (const tid of ids) {
      if (world.sight[`${id}>${tid}`] === undefined) continue;
      const t = world.entities[tid] as Entity;
      if (t.side !== "defender" || t.state === "down") continue;
      const dx = t.pos.xCm - e.pos.xCm, dy = t.pos.yCm - e.pos.yCm;
      if (dx * dx + dy * dy < threatD2) {
        threat = t;
        threatD2 = dx * dx + dy * dy;
      }
    }
    if (world.opCover[id] !== undefined) {
      if (!suppressed && !threat) delete world.opCover[id];
      continue;
    }
    if (e.motion !== undefined || !suppressed || !threat) continue;

    world.opCover[id] = { ...e.pos };
    const taken: EntityPos[] = [];
    for (const other of Object.keys(world.opCover).sort()) if (other !== id) taken.push(world.opCover[other] as EntityPos);
    const found = findCover(ctx, e, threat.pos, taken);
    if (found === undefined || found === "covered") continue;
    const why = startMove(e, { floor: e.pos.floor, x: fromCm(found.xCm), y: fromCm(found.yCm) }, ctx);
    if (why === undefined) world.opCover[id] = { floor: e.pos.floor, xCm: found.xCm, yCm: found.yCm };
  }
};
