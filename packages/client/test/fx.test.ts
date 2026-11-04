import { describe, expect, it } from "vitest";
import { MATERIALS } from "../src/greybox/plan";
import { HEAT_BUCKETS, heatBucket, heatForMaterial } from "../src/fx/heat";
import { summarize } from "../src/fx/stats";

describe("heat values", () => {
  it("gives every greybox material a heat in 0..1, and people hotter than any building material", () => {
    for (const key of Object.keys(MATERIALS)) {
      const h = heatForMaterial(key);
      expect(h, key).toBeGreaterThanOrEqual(0);
      expect(h, key).toBeLessThanOrEqual(1);
      expect(h, key).toBeLessThan(heatForMaterial("unit"));
    }
  });

  it("water is colder than walls, and unknown materials get a neutral default", () => {
    expect(heatForMaterial("zone:sea")).toBeLessThan(heatForMaterial("wall:stone"));
    expect(heatForMaterial("nonsense")).toBe(heatForMaterial("slab"));
  });

  it("snaps heat to a few buckets so materials can be shared", () => {
    expect(HEAT_BUCKETS.length).toBeLessThanOrEqual(6);
    expect(heatBucket(0)).toBe(HEAT_BUCKETS[0]);
    expect(heatBucket(1)).toBe(HEAT_BUCKETS.at(-1));
    expect(HEAT_BUCKETS).toContain(heatBucket(0.37));
  });
});

describe("summarize", () => {
  it("reports mean, median, p95 and max of frame times", () => {
    const s = summarize([10, 20, 30, 40, 100]);
    expect(s.n).toBe(5);
    expect(s.mean).toBe(40);
    expect(s.median).toBe(30);
    expect(s.max).toBe(100);
    expect(s.p95).toBe(100);
  });
  it("handles one sample and none", () => {
    expect(summarize([7])).toEqual({ n: 1, mean: 7, median: 7, p95: 7, max: 7 });
    expect(summarize([])).toEqual({ n: 0, mean: 0, median: 0, p95: 0, max: 0 });
  });
});
