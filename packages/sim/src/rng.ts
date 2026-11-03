/**
 * Seeded PRNG: xoshiro128** with explicit state, seeded through splitmix32.
 * All simulation randomness must come from here (never Math.random).
 */

export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Next uniform unsigned 32-bit integer. */
  nextU32(): number;
  /** Uniform float in [0, 1). */
  nextFloat(): number;
  /** Uniform integer in [min, maxInclusive]. Unbiased (rejection sampling). */
  int(min: number, maxInclusive: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(array: readonly T[]): T;
  /** Copy of the internal state, for serialization. */
  state(): RngState;
  /** Resume from a state produced by `state()`. */
  restore(state: RngState): void;
}

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

const TWO_POW_32 = 4294967296;

export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed)) throw new Error(`rng seed must be an integer, got ${seed}`);

  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;

  const setState = (a: number, b: number, c: number, d: number): void => {
    s0 = a >>> 0;
    s1 = b >>> 0;
    s2 = c >>> 0;
    s3 = d >>> 0;
  };

  const sm = splitmix32(seed);
  setState(sm(), sm(), sm(), sm());
  // xoshiro must never start in the all-zero state.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };

  const int = (min: number, maxInclusive: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(maxInclusive) || maxInclusive < min) {
      throw new Error(`rng.int needs integers with min <= max, got ${min}, ${maxInclusive}`);
    }
    const range = maxInclusive - min + 1;
    if (range > TWO_POW_32) throw new Error("rng.int range exceeds 2^32");
    // Reject the tail that would bias the modulo.
    const limit = TWO_POW_32 - (TWO_POW_32 % range);
    let r = nextU32();
    while (r >= limit) r = nextU32();
    return min + (r % range);
  };

  return {
    nextU32,
    nextFloat: () => nextU32() / TWO_POW_32,
    int,
    pick<T>(array: readonly T[]): T {
      if (array.length === 0) throw new Error("rng.pick on an empty array");
      return array[int(0, array.length - 1)] as T;
    },
    state: () => [s0, s1, s2, s3],
    restore(state) {
      const [a, b, c, d] = state;
      for (const v of state) {
        if (!Number.isInteger(v) || v < 0 || v >= TWO_POW_32) {
          throw new Error("rng.restore: each state word must be a uint32");
        }
      }
      if ((a | b | c | d) === 0) throw new Error("rng.restore: all-zero state is invalid");
      setState(a, b, c, d);
    },
  };
}
