import { describe, expect, it } from "vitest";
import { loadMap, parseArgs, summarize } from "../src/headlessCore";

describe("parseArgs", () => {
  it("applies defaults", () => {
    expect(parseArgs([])).toEqual({ seeds: 10, ticks: 600, map: "sandbox" });
  });

  it("reads --flag value pairs, and ignores a leading bare --", () => {
    expect(parseArgs(["--", "--seeds", "100", "--ticks", "600", "--map", "charon"])).toEqual({
      seeds: 100,
      ticks: 600,
      map: "charon",
    });
  });

  it("rejects bad values and unknown flags", () => {
    expect(() => parseArgs(["--seeds", "0"])).toThrow(/seeds/);
    expect(() => parseArgs(["--seeds", "abc"])).toThrow(/seeds/);
    expect(() => parseArgs(["--ticks", "-5"])).toThrow(/ticks/);
    expect(() => parseArgs(["--bogus", "1"])).toThrow(/bogus/);
    expect(() => parseArgs(["--seeds"])).toThrow(/seeds/);
  });
});

describe("loadMap", () => {
  it("loads the built-in sandbox map", () => {
    expect(loadMap("sandbox").id).toBe("sandbox");
  });

  it("gives a clear error for a map that does not exist yet", () => {
    expect(() => loadMap("no-such-map")).toThrow(/no-such-map/);
  });

  it("rejects map names that try to escape the maps folder", () => {
    expect(() => loadMap("../secrets")).toThrow(/map name/i);
  });
});

describe("summarize", () => {
  it("runs N seeded raids and reports per-seed results", () => {
    const summary = summarize({ seeds: 5, ticks: 100, map: "sandbox" });
    expect(summary.map).toBe("sandbox");
    expect(summary.runs).toHaveLength(5);
    expect(summary.runs.map((r) => r.seed)).toEqual([1, 2, 3, 4, 5]);
    for (const run of summary.runs) {
      expect(run.ticks).toBe(100);
      expect(run.finalHash).toMatch(/^[0-9a-f]{8}$/);
      expect(run.eventCounts["moved"]).toBeGreaterThan(0);
      expect(run.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the same hashes and event counts every time (durations aside)", () => {
    const strip = (s: ReturnType<typeof summarize>) =>
      s.runs.map((r) => ({ seed: r.seed, ticks: r.ticks, finalHash: r.finalHash, eventCounts: r.eventCounts }));
    const a = strip(summarize({ seeds: 4, ticks: 150, map: "sandbox" }));
    const b = strip(summarize({ seeds: 4, ticks: 150, map: "sandbox" }));
    expect(b).toEqual(a);
  });
});
