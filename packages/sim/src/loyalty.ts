import { LOYALTIES } from "./defaults";
import type { Loyalty } from "./defaults";

/**
 * A spawn marker's `guard:<hired|veteran|inner-circle>` tag, or undefined when absent (which means veteran). An unknown
 * value, or the tag on anyone but a defender, is an error that names the marker.
 */
export function loyaltyTag(tags: readonly string[], markerId: string, side: string): Loyalty | undefined {
  const hit = tags.find((t) => t.startsWith("guard:"));
  if (hit === undefined) return undefined;
  const raw = hit.slice(6);
  if (!(LOYALTIES as readonly string[]).includes(raw)) throw new Error(`spawn marker ${markerId} has a bad guard tag: guard:${raw} (use ${LOYALTIES.join(", ")})`);
  if (side !== "defender") throw new Error(`spawn marker ${markerId} has a guard tag but is not a defender`);
  return raw as Loyalty;
}
