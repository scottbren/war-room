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

/**
 * Defenders do not see all around (operators do: a team covers its own sides). Within FOV_FULL_DEG of where a defender
 * faces it sees the full range; out to FOV_SIDE_DEG it sees only PERIPHERAL_RANGE_CM; beyond that (behind it) only
 * BEHIND_RANGE_CM. Angles are whole degrees either side of its facing.
 */
export const FOV_FULL_DEG = 60;
export const FOV_SIDE_DEG = 120;
export const PERIPHERAL_RANGE_CM = 500;
export const BEHIND_RANGE_CM = 200;

/** A working camera sees this far (25 m), less if the target is concealed. */
export const CAMERA_RANGE_CM = 2500;
/** A camera sighting reaches the defenders this many ticks later (2 s): someone in the security office has to notice. */
export const CAMERA_REPORT_DELAY_TICKS = 20;

/** A unit fires at most once per this many ticks (0.5 s). */
export const FIRE_INTERVAL_TICKS = 5;
/** Hit chance per mille by distance: [farthest cm of the band, chance]. Beyond the last band there is no shot. */
export const HIT_BANDS: readonly (readonly [number, number])[] = [
  [1000, 800],
  [2000, 550],
  [3000, 300],
  [4000, 150],
];
/** Damage of one hit, inclusive. A unit has 100 health. */
export const DAMAGE_MIN = 15;
export const DAMAGE_MAX = 35;
/** An unaware defender still fires at an operator this close (10 m). */
export const POINT_BLANK_CM = 1000;
/** A shot is heard out to 60 m in the open. */
export const SHOT_NOISE_CM = 6000;

/** Cover must be within this distance (80 cm) of the target, on the shooter's side, to count. */
export const COVER_REACH_CM = 80;
/** Hit-chance multipliers in per mille. */
export const HEAVY_COVER_PM = 500;
export const LIGHT_COVER_PM = 750;
export const MOVING_TARGET_PM = 750;
/** A shooter this suppressed (50+, 80+) shoots at 60% / 40% of its normal accuracy. */
export const SUPPRESSED_AIM: readonly (readonly [number, number])[] = [
  [80, 400],
  [50, 600],
];
/** A shot passing within this distance (2 m) of a unit suppresses it; a hit adds more than a miss. Capped at 100, decays 1 per tick. */
export const SUPPRESS_RADIUS_CM = 200;
export const SUPPRESS_NEAR = 10;
export const SUPPRESS_HIT = 25;
export const SUPPRESS_MAX = 100;
/** At this suppression a unit will not advance: it stays put until it recovers. */
export const PINNED_AT = 80;
