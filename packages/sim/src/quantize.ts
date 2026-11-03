import type { Pos } from "./types";

/** Simulation positions live on a 1 cm grid. */

function assertFinite(n: number): void {
  if (!Number.isFinite(n)) throw new Error(`quantize: non-finite value ${n}`);
}

/** Meters to integer centimeters (round half up). Never returns -0. */
export function toCm(m: number): number {
  assertFinite(m);
  return Math.round(m * 100) + 0;
}

/** Integer centimeters to meters. */
export function fromCm(cm: number): number {
  assertFinite(cm);
  return cm / 100 + 0; // + 0 turns -0 into 0
}

/** Snap a position to the 1 cm grid. */
export function quantizePos(pos: Pos): Pos {
  return { floor: pos.floor, x: fromCm(toCm(pos.x)), y: fromCm(toCm(pos.y)) };
}
