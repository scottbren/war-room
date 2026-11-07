import { describe, expect, it } from "vitest";
import { TRACER_MS, createGunfire, freshSince, tracerAlpha, woundColor, woundOf } from "../src/combatFx";
import type { AudioLike } from "../src/combatFx";

describe("combat display helpers", () => {
  it("freshSince keeps only what is newer than the last tick drawn, in order", () => {
    const items = [{ tick: 3 }, { tick: 5 }, { tick: 5 }, { tick: 9 }];
    expect(freshSince(items, 5)).toEqual([{ tick: 9 }]);
    expect(freshSince(items, -1)).toHaveLength(4);
    expect(freshSince([], 0)).toEqual([]);
  });

  it("wound bands match the sim's (60 and 30), and a downed unit is not tinted", () => {
    expect(woundOf(100, false)).toBe("healthy");
    expect(woundOf(61, false)).toBe("healthy");
    expect(woundOf(60, false)).toBe("wounded");
    expect(woundOf(31, false)).toBe("wounded");
    expect(woundOf(30, false)).toBe("badly");
    expect(woundOf(1, false)).toBe("badly");
    expect(woundOf(0, true)).toBe("healthy");
  });

  it("a wound moves the colour toward red, more when worse, and none leaves it alone", () => {
    const blue = [0.2, 0.6, 1] as const;
    expect(woundColor(blue, "healthy")).toEqual([0.2, 0.6, 1]);
    const some = woundColor(blue, "wounded");
    const most = woundColor(blue, "badly");
    expect(some[0]).toBeGreaterThan(0.2);
    expect(most[0]).toBeGreaterThan(some[0]);
    expect(most[2]).toBeLessThan(some[2]);
  });

  it("a tracer fades from 1 to 0 over its life and is gone after", () => {
    expect(tracerAlpha(0)).toBe(1);
    expect(tracerAlpha(TRACER_MS / 2)).toBeCloseTo(0.5);
    expect(tracerAlpha(TRACER_MS)).toBe(0);
    expect(tracerAlpha(TRACER_MS + 500)).toBe(0);
    expect(tracerAlpha(-1)).toBe(0);
  });

  it("gunfire plays only once the audio context is running, and survives having no audio at all", () => {
    expect(createGunfire(() => undefined).shot()).toBe(false);

    const started: number[] = [];
    let resumed = 0;
    const fake = (state: string): AudioLike => {
      const node = { connect: () => {} };
      return {
        currentTime: 1,
        sampleRate: 1000,
        state,
        resume: () => { resumed++; return Promise.resolve(); },
        createBuffer: (_c, length) => ({ getChannelData: () => new Float32Array(length) }),
        createBufferSource: () => ({ ...node, buffer: undefined, start: (t: number) => { started.push(t); } }),
        createGain: () => ({ ...node, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }),
        destination: {},
      };
    };
    const suspended = createGunfire(() => fake("suspended"));
    expect(suspended.shot()).toBe(false); // not unlocked yet
    suspended.unlock();
    expect(resumed).toBe(1);

    const running = createGunfire(() => fake("running"));
    running.unlock();
    expect(resumed).toBe(1); // already running: nothing to resume
    expect(running.shot()).toBe(true);
    expect(running.shot()).toBe(true);
    expect(started).toEqual([1, 1]);
  });
});
