import { BADLY_WOUNDED_AT, WOUNDED_AT, WOUND_AIM_PM, WOUND_SPEED_PM } from "./defaults";

/** Walking speed multiplier in per mille for a unit with this health. */
export function speedPm(health: number): number {
  return health <= BADLY_WOUNDED_AT ? WOUND_SPEED_PM[1] : health <= WOUNDED_AT ? WOUND_SPEED_PM[0] : 1000;
}

/** Aim multiplier in per mille for a shooter with this health. */
export function aimPm(health: number): number {
  return health <= BADLY_WOUNDED_AT ? WOUND_AIM_PM[1] : health <= WOUNDED_AT ? WOUND_AIM_PM[0] : 1000;
}
