import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng";
import { angleBetween, cosDeg, normDeg, sinDeg } from "../src/trig";
import { fromCm, quantizePos, toCm } from "../src/quantize";
import { canonicalize, fnv1a32, hashState } from "../src/hash";

function draw(seed: number, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.nextU32());
}

describe("rng", () => {
  it("(a) same seed gives the same 10,000-number sequence across two runs", () => {
    const a = draw(12345, 10_000);
    const b = draw(12345, 10_000);
    expect(a).toHaveLength(10_000);
    expect(b).toEqual(a);
  });

  it("different seeds give different sequences", () => {
    expect(draw(1, 16)).not.toEqual(draw(2, 16));
    expect(draw(0, 16)).not.toEqual(draw(1, 16));
  });

  it("produces uint32 values with no obvious bias in the low bit", () => {
    const xs = draw(7, 10_000);
    expect(xs.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)).toBe(true);
    const ones = xs.filter((x) => (x & 1) === 1).length;
    expect(ones).toBeGreaterThan(4700);
    expect(ones).toBeLessThan(5300);
  });

  it("(b) save/restore resumes the identical sequence", () => {
    const rng = createRng(99);
    for (let i = 0; i < 137; i++) rng.nextU32();
    const saved = rng.state();
    const expected = Array.from({ length: 500 }, () => rng.nextU32());

    const other = createRng(1);
    other.restore(saved);
    const resumed = Array.from({ length: 500 }, () => other.nextU32());
    expect(resumed).toEqual(expected);
  });

  it("state() returns a copy that does not alias internals", () => {
    const rng = createRng(5);
    const s = rng.state();
    const first = rng.nextU32();
    const again = createRng(5);
    again.restore(s);
    expect(again.nextU32()).toBe(first);
  });

  it("restore rejects invalid states", () => {
    const rng = createRng(1);
    expect(() => rng.restore([0, 0, 0, 0])).toThrow();
    expect(() => rng.restore([1, 2, 3, -1])).toThrow();
    expect(() => rng.restore([1, 2, 3, 2 ** 32])).toThrow();
  });

  it("nextFloat is in [0, 1)", () => {
    const rng = createRng(3);
    for (let i = 0; i < 10_000; i++) {
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("int covers the inclusive range and respects bounds", () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(rng.int(4, 4)).toBe(4);
    expect(() => rng.int(3, 2)).toThrow();
    expect(() => rng.int(0.5, 2)).toThrow();
  });

  it("pick returns members and rejects empty arrays", () => {
    const rng = createRng(21);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });

  it("rejects non-integer seeds", () => {
    expect(() => createRng(1.5)).toThrow();
  });
});

describe("trig tables", () => {
  it("matches known values", () => {
    expect(sinDeg(0)).toBe(0);
    expect(sinDeg(90)).toBe(1);
    expect(sinDeg(180)).toBe(0);
    expect(sinDeg(270)).toBe(-1);
    expect(sinDeg(30)).toBe(0.5);
    expect(cosDeg(0)).toBe(1);
    expect(cosDeg(60)).toBe(0.5);
    expect(cosDeg(90)).toBe(0);
    expect(cosDeg(180)).toBe(-1);
    expect(sinDeg(45)).toBeCloseTo(0.707107, 6);
  });

  it("wraps negative and large angles", () => {
    expect(normDeg(-90)).toBe(270);
    expect(normDeg(720)).toBe(0);
    expect(sinDeg(-90)).toBe(-1);
    expect(cosDeg(450)).toBe(0);
    expect(() => normDeg(1.5)).toThrow();
  });

  it("satisfies sin^2 + cos^2 = 1 for every degree", () => {
    for (let d = 0; d < 360; d++) {
      expect(sinDeg(d) ** 2 + cosDeg(d) ** 2).toBeCloseTo(1, 5);
    }
  });
});

describe("angleBetween", () => {
  const o = { x: 0, y: 0 };

  it("(c) is correct for all eight octant boundaries (compass directions)", () => {
    expect(angleBetween(o, { x: 0, y: 1 })).toBe(0);
    expect(angleBetween(o, { x: 1, y: 1 })).toBe(45);
    expect(angleBetween(o, { x: 1, y: 0 })).toBe(90);
    expect(angleBetween(o, { x: 1, y: -1 })).toBe(135);
    expect(angleBetween(o, { x: 0, y: -1 })).toBe(180);
    expect(angleBetween(o, { x: -1, y: -1 })).toBe(225);
    expect(angleBetween(o, { x: -1, y: 0 })).toBe(270);
    expect(angleBetween(o, { x: -1, y: 1 })).toBe(315);
  });

  it("(c) is correct inside each of the eight octants", () => {
    // atan(1/2) = 26.565 deg, so 27 and its mirrors.
    expect(angleBetween(o, { x: 1, y: 2 })).toBe(27); // NE, near north
    expect(angleBetween(o, { x: 2, y: 1 })).toBe(63); // NE, near east
    expect(angleBetween(o, { x: 2, y: -1 })).toBe(117); // SE, near east
    expect(angleBetween(o, { x: 1, y: -2 })).toBe(153); // SE, near south
    expect(angleBetween(o, { x: -1, y: -2 })).toBe(207); // SW, near south
    expect(angleBetween(o, { x: -2, y: -1 })).toBe(243); // SW, near west
    expect(angleBetween(o, { x: -2, y: 1 })).toBe(297); // NW, near west
    expect(angleBetween(o, { x: -1, y: 2 })).toBe(333); // NW, near north
  });

  it("(c) edge cases: identical points, offsets from a non-origin, tiny and huge extents", () => {
    expect(angleBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    expect(angleBetween({ x: 10, y: 10 }, { x: 10, y: 20 })).toBe(0);
    expect(angleBetween({ x: 10, y: 10 }, { x: 0, y: 10 })).toBe(270);
    expect(angleBetween(o, { x: 0.01, y: 0 })).toBe(90);
    expect(angleBetween(o, { x: 0.01, y: 0.01 })).toBe(45);
    expect(angleBetween(o, { x: 100000, y: 100000 })).toBe(45);
    // Just off an axis rounds to the axis.
    expect(angleBetween(o, { x: 0.01, y: 1000 })).toBe(0);
  });

  it("(c) recovers every whole degree from table-generated points", () => {
    for (let d = 0; d < 360; d++) {
      const p = { x: sinDeg(d) * 1000, y: cosDeg(d) * 1000 };
      expect(angleBetween(o, p)).toBe(d);
    }
  });

  it("is antisymmetric by 180 degrees", () => {
    const a = { x: 3.2, y: -7.9 };
    const b = { x: -11.4, y: 2.6 };
    expect((angleBetween(a, b) + 180) % 360).toBe(angleBetween(b, a));
  });
});

describe("quantize", () => {
  it("converts to and from centimeters", () => {
    expect(toCm(1.234)).toBe(123);
    expect(toCm(-1.234)).toBe(-123);
    expect(toCm(0.005)).toBe(1);
    expect(fromCm(123)).toBe(1.23);
    expect(Object.is(toCm(-0.001), 0)).toBe(true);
  });

  it("snaps positions and keeps the floor", () => {
    expect(quantizePos({ floor: "upper", x: 1.2349, y: -0.004 })).toEqual({
      floor: "upper",
      x: 1.23,
      y: 0,
    });
  });

  it("rejects non-finite values", () => {
    expect(() => toCm(Number.NaN)).toThrow();
    expect(() => fromCm(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("hash", () => {
  it("(d) hashing the same object with keys in different insertion order gives the same hash", () => {
    const a = { id: "x", pos: { x: 1, y: 2, floor: "ground" }, list: [1, 2, { b: 1, a: 2 }] };
    const b = { list: [1, 2, { a: 2, b: 1 }], pos: { floor: "ground", y: 2, x: 1 }, id: "x" };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(hashState(a)).toBe(hashState(b));
  });

  it("array order and values still matter", () => {
    expect(hashState({ l: [1, 2] })).not.toBe(hashState({ l: [2, 1] }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });

  it("quantizes sub-millimeter float noise but keeps real differences", () => {
    expect(hashState({ x: 0.1 + 0.2 })).toBe(hashState({ x: 0.3 }));
    expect(hashState({ x: 1.0004 })).toBe(hashState({ x: 1 }));
    expect(hashState({ x: 1.01 })).not.toBe(hashState({ x: 1 }));
    expect(hashState({ x: -0 })).toBe(hashState({ x: 0 }));
  });

  it("skips undefined properties and rejects non-finite numbers", () => {
    expect(hashState({ a: 1, b: undefined })).toBe(hashState({ a: 1 }));
    expect(() => hashState({ a: Number.NaN })).toThrow();
  });

  it("rejects Map, Set, RegExp and class instances instead of hashing them as {}", () => {
    expect(() => hashState({ m: new Map([[1, 2]]) })).toThrow();
    expect(() => hashState({ s: new Set([1]) })).toThrow();
    expect(() => hashState({ r: /x/ })).toThrow();
    expect(() => hashState(new (class Foo {})())).toThrow();
    expect(() => hashState(Object.create(null))).not.toThrow();
  });

  it("serializes sparse array holes as null", () => {
    const sparse: number[] = new Array<number>(2);
    sparse[1] = 1;
    expect(canonicalize(sparse)).toBe("[null,1]");
  });

  it("FNV-1a matches published test vectors and returns 8 hex digits", () => {
    expect(fnv1a32("")).toBe("811c9dc5");
    expect(fnv1a32("a")).toBe("e40c292c");
    expect(fnv1a32("foobar")).toBe("bf9cf968");
  });
});
