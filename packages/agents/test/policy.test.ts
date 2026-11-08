import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, createPolicy } from "../src/policy";
import type { Happening } from "../src/watch";

const h = (kind: Happening["kind"], key: string, importance = 2): Happening => ({ kind, key, importance, tick: 0, description: key });

describe("trigger policy", () => {
  it("picks who reacts: the ground commander first, then the mission commander", () => {
    expect(createPolicy().offer(h("contact", "contact:a"), 0)).toEqual(["reyes", "hale"]);
  });

  it("adds the national security advisor on a casualty, but only up to the voice limit", () => {
    expect(createPolicy({ ...DEFAULT_POLICY, maxVoices: 3 }).offer(h("casualty", "casualty:a", 3), 0)).toEqual(["reyes", "hale", "navarro"]);
    expect(createPolicy().offer(h("casualty", "casualty:a", 3), 0)).toHaveLength(2);
  });

  it("ignores a happening below the importance threshold", () => {
    expect(createPolicy().offer(h("contact", "contact:a", 1), 0)).toEqual([]);
    expect(createPolicy({ ...DEFAULT_POLICY, minImportance: 1 }).offer(h("contact", "contact:a", 1), 0)).toEqual(["reyes", "hale"]);
  });

  it("does not repeat the same happening within the dedup window, but does after it", () => {
    const p = createPolicy({ ...DEFAULT_POLICY, advisorGapTicks: 0 });
    expect(p.offer(h("contact", "contact:a"), 0)).not.toEqual([]);
    expect(p.offer(h("contact", "contact:a"), DEFAULT_POLICY.dedupTicks - 1)).toEqual([]);
    expect(p.offer(h("contact", "contact:a"), DEFAULT_POLICY.dedupTicks)).not.toEqual([]);
  });

  it("keeps an advisor quiet for a while after speaking, and lets someone else take the next thing", () => {
    const p = createPolicy({ ...DEFAULT_POLICY, maxVoices: 1 });
    expect(p.offer(h("contact", "contact:a"), 0)).toEqual(["reyes"]);
    expect(p.offer(h("contact", "contact:b"), 10)).toEqual(["hale"]); // reyes is still quiet
    expect(p.offer(h("contact", "contact:c"), 20)).toEqual([]); // both busy: dropped
    expect(p.offer(h("contact", "contact:d"), DEFAULT_POLICY.advisorGapTicks)).toEqual(["reyes"]); // reyes is back
  });

  it("does not remember a happening that nobody could take, so a repeat can still be heard", () => {
    const p = createPolicy({ ...DEFAULT_POLICY, maxVoices: 1 });
    p.offer(h("contact", "contact:a"), 0);
    p.offer(h("contact", "contact:b"), 1);
    expect(p.offer(h("contact", "contact:c"), 2)).toEqual([]); // dropped while both are quiet
    expect(p.offer(h("contact", "contact:c"), DEFAULT_POLICY.advisorGapTicks + 5)).not.toEqual([]);
  });

  it("is deterministic: the same offers give the same answers", () => {
    const run = () => {
      const p = createPolicy();
      return [0, 40, 120, 130, 500].map((t, i) => p.offer(h(i % 2 ? "gunfire" : "contact", `k${i % 3}`), t));
    };
    expect(run()).toEqual(run());
  });
});
