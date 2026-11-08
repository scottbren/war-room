import type { AdvisorId } from "./advisors";
import type { Happening, HappeningKind } from "./watch";

/** Trigger policy knobs (technical design: per-advisor rate limits, importance thresholds, deduplication). Tuning values, to be judged in play. */
export interface PolicyConfig {
  /** Happenings below this importance are ignored. */
  minImportance: number;
  /** An advisor stays quiet for this many ticks after speaking up on their own. */
  advisorGapTicks: number;
  /** The same happening (same key) is not reacted to again within this many ticks. */
  dedupTicks: number;
  /** At most this many advisors react to one happening. */
  maxVoices: number;
}

export const DEFAULT_POLICY: PolicyConfig = { minImportance: 2, advisorGapTicks: 100, dedupTicks: 300, maxVoices: 2 };

/**
 * Who has something to say about what, in the order they would speak. The ground commander reports what his teams see;
 * the mission commander reacts to the fight; the national security advisor weighs in when it costs lives (exposure).
 */
const WHO: Record<HappeningKind, readonly AdvisorId[]> = {
  contact: ["reyes", "hale"],
  gunfire: ["reyes", "hale"],
  casualty: ["reyes", "hale", "navarro"],
};

/** Decides which advisors react, if any. Pure and deterministic: the same offers at the same ticks give the same answers. */
export function createPolicy(config: PolicyConfig = DEFAULT_POLICY): { offer(happening: Happening, now: number): AdvisorId[] } {
  const lastSpoke = new Map<AdvisorId, number>();
  const lastKey = new Map<string, number>();
  return {
    offer(h, now) {
      if (h.importance < config.minImportance) return [];
      const seen = lastKey.get(h.key);
      if (seen !== undefined && now - seen < config.dedupTicks) return [];
      const chosen: AdvisorId[] = [];
      for (const id of WHO[h.kind]) {
        if (chosen.length >= config.maxVoices) break;
        const spoke = lastSpoke.get(id);
        if (spoke !== undefined && now - spoke < config.advisorGapTicks) continue;
        chosen.push(id);
      }
      // If everyone was busy the happening is dropped, and not remembered, so a repeat can still be heard.
      if (chosen.length === 0) return [];
      lastKey.set(h.key, now);
      for (const id of chosen) lastSpoke.set(id, now);
      return chosen;
    },
  };
}
