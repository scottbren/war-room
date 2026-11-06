import type { Side } from "@war-room/content";
import { BEHIND_RANGE_CM, FOV_FULL_DEG, FOV_SIDE_DEG, PERIPHERAL_RANGE_CM, SIGHT_RANGE_CM } from "../defaults";
import { fromCm } from "../quantize";
import { angleBetween } from "../trig";
import type { Entity } from "../world";

/** Who can notice whom. Operators watch everyone who is not theirs; defenders watch operators. */
export function canObserve(observer: Side, target: Side): boolean {
  if (observer === "operator") return target !== "operator";
  if (observer === "defender") return target === "operator";
  return false;
}

/** How far this observer can see toward a point, by where the observer is facing. Operators see all around. */
export function reachCm(o: Entity, xCm: number, yCm: number): number {
  if (o.side !== "defender") return SIGHT_RANGE_CM;
  const bearing = angleBetween({ x: fromCm(o.pos.xCm), y: fromCm(o.pos.yCm) }, { x: fromCm(xCm), y: fromCm(yCm) });
  const off = Math.abs(((bearing - o.facing + 540) % 360) - 180); // 0 straight ahead .. 180 straight behind
  if (off <= FOV_FULL_DEG) return SIGHT_RANGE_CM;
  return off <= FOV_SIDE_DEG ? PERIPHERAL_RANGE_CM : BEHIND_RANGE_CM;
}
