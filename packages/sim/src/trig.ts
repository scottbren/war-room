/**
 * Deterministic trigonometry. Angles are integer degrees, 0 = north,
 * increasing clockwise. No Math.sin/cos/atan: tables are built from a fixed
 * Taylor series (only + - * /, which are exact IEEE operations on every
 * platform) and rounded to 1e-6, then mirrored by symmetry so the table is
 * exactly symmetric.
 */

const PI = 3.141592653589793;

function taylorSin(x: number): number {
  // x in [0, pi/2]; terms up to x^17 give error well below 1e-12.
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 8; n++) {
    term = (-term * x2) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** SIN[d] for d = 0..90, built directly; the rest follow by symmetry. */
const SIN_QUADRANT: number[] = [];
for (let d = 0; d <= 90; d++) {
  SIN_QUADRANT.push(d === 90 ? 1 : round6(taylorSin((d * PI) / 180)));
}

const SIN_TABLE: number[] = new Array<number>(360);
for (let d = 0; d < 360; d++) {
  let r = d % 180;
  if (r > 90) r = 180 - r;
  const v = SIN_QUADRANT[r] as number;
  SIN_TABLE[d] = d < 180 ? v : 0 - v; // 0 - v, never -v: avoids -0
}

/** Wrap any integer number of degrees into [0, 359]. */
export function normDeg(deg: number): number {
  if (!Number.isInteger(deg)) throw new Error(`normDeg: expected integer degrees, got ${deg}`);
  return ((deg % 360) + 360) % 360;
}

export function sinDeg(deg: number): number {
  return SIN_TABLE[normDeg(deg)] as number;
}

export function cosDeg(deg: number): number {
  return SIN_TABLE[normDeg(deg + 90)] as number;
}

/** tan(d) * 65536 for d = 0..45, as integers (from the tables above). */
const TAN_Q16: number[] = [];
for (let d = 0; d <= 45; d++) {
  TAN_Q16.push(Math.round(((SIN_QUADRANT[d] as number) / (SIN_QUADRANT[90 - d] as number)) * 65536));
}

/** Integer angle in [0, 45] whose tangent is nearest to num/den (0 <= num <= den, den > 0). */
function atanOctant(num: number, den: number): number {
  const ratio = Math.floor((num * 65536) / den); // Q16, 0..65536
  let lo = 0;
  while (lo < 45 && (TAN_Q16[lo + 1] as number) <= ratio) lo++;
  if (lo < 45) {
    const below = ratio - (TAN_Q16[lo] as number);
    const above = (TAN_Q16[lo + 1] as number) - ratio;
    if (below >= above) lo++;
  }
  return lo;
}

/**
 * Bearing from `a` to `b` in integer degrees [0, 359], 0 = north (+y),
 * 90 = east (+x), clockwise. Inputs are meters and are snapped to whole
 * centimeters first; the rest is integer-only. Identical points give 0.
 */
export function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = Math.round((b.x - a.x) * 100) + 0;
  const dy = Math.round((b.y - a.y) * 100) + 0;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("angleBetween: non-finite input");
  if (dx === 0 && dy === 0) return 0;

  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  let bearing: number;

  if (dx >= 0 && dy > 0) {
    // north-east
    bearing = ady >= adx ? atanOctant(adx, ady) : 90 - atanOctant(ady, adx);
  } else if (dx > 0 && dy <= 0) {
    // south-east
    bearing = adx >= ady ? 90 + atanOctant(ady, adx) : 180 - atanOctant(adx, ady);
  } else if (dx <= 0 && dy < 0) {
    // south-west
    bearing = ady >= adx ? 180 + atanOctant(adx, ady) : 270 - atanOctant(ady, adx);
  } else {
    // north-west (dx < 0, dy >= 0)
    bearing = adx >= ady ? 270 + atanOctant(ady, adx) : 360 - atanOctant(adx, ady);
  }
  return bearing % 360;
}
