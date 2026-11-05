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

/** Footsteps carry this many ticks' worth of walking speed times this factor: an operator (20 cm/tick) is heard out to 8 m, a defender (15) to 6 m. */
export const STEP_NOISE_FACTOR = 40;
/** A door opening, closing or locking is heard out to 12 m. */
export const DOOR_NOISE_CM = 1200;
/** An observer listens for footsteps every this many ticks (offset by its rank); door sounds are heard at once. */
export const HEAR_EVERY = 5;
/** A sound with no clear path (a wall or another floor in the way) carries half as far; through another floor, a third. */
export const MUFFLE_WALL_DIV = 2;
export const MUFFLE_FLOOR_DIV = 3;

/** How far anyone can see in the open, in centimeters (20 m). Concealment halves it. */
export const SIGHT_RANGE_CM = 2000;
/** An observer re-checks its targets every this many ticks, offset by its rank so the work is spread out. */
export const SIGHT_CHECK_EVERY = 3;
/** While a target stays in view, its `contact` event repeats after this many ticks (a heartbeat for the knowledge layer; with checks every 3 ticks that is every check). */
export const CONTACT_REFRESH_TICKS = 3;
