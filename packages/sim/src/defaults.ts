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

/** A defender who sees an operator radios the others; they learn the position this many ticks later (3 s). */
export const RADIO_DELAY_TICKS = 30;
/** A suspicious defender searches the spot this long after arriving (5 s) before going back to its post. */
export const SEARCH_TICKS = 50;
/** An alerted defender with no new sighting or report for this long (15 s) goes to look at the last spot. */
export const ALERT_CALM_TICKS = 150;
/** A suspicious defender already walking to a spot only changes course for a new sound this far (3 m) from it. */
export const RETARGET_CM = 300;
