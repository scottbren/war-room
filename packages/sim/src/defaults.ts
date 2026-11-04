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

/** How far anyone can see in the open, in centimeters (20 m). Concealment halves it. */
export const SIGHT_RANGE_CM = 2000;
/** An observer re-checks its targets every this many ticks, offset by its rank so the work is spread out. */
export const SIGHT_CHECK_EVERY = 3;
/** While a target stays in view, its `contact` event repeats after this many ticks (a heartbeat for the knowledge layer; with checks every 3 ticks that is every check). */
export const CONTACT_REFRESH_TICKS = 3;
