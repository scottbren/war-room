import type { Side } from "@war-room/content";

/**
 * Week-1 unit stats, used until unit types are wired in from content.
 * Speed is in whole centimeters per tick (10 ticks per second): 20 = 2.0 m/s.
 */
export const DEFAULT_SPEED_CM_PER_TICK: Record<Side, number> = {
  operator: 20,
  defender: 15,
  civilian: 12,
  family: 12,
  principal: 12,
};

export const DEFAULT_HEALTH = 100;
