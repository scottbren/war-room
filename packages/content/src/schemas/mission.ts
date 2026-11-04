import { z } from "zod";
import { Probability } from "./common";

/** Minutes after midnight, 0 to 1439. */
const MinuteOfDay = z.number().int().min(0).max(1439);

/**
 * A family member's habit: between `from` and `to` they are usually at `location` (a poi marker tagged
 * "routine:<activity>" and "member:<wife|son|daughter>"). Whether they keep it on a given night is `probability`.
 * Added 2026-11-04 with approval; the sim picks starting positions from these when it gets family spawning.
 */
export const Routine = z
  .object({
    id: z.string().min(1),
    member: z.enum(["wife", "son", "daughter"]),
    from: MinuteOfDay,
    to: MinuteOfDay,
    location: z.string().min(1), // marker id
    probability: Probability,
  })
  .strict()
  .refine((r) => r.from < r.to, { message: "a routine must start before it ends, within one day" });
export type Routine = z.infer<typeof Routine>;

export const Mission = z
  .object({
    id: z.string().min(1),
    mapId: z.string().min(1),
    seedPolicy: z.enum(["random", "fixed"]),
    principalSpawnOptions: z.array(z.string()), // marker ids
    driveLocationOptions: z.array(z.string()), // marker ids
    familyPresence: z
      .object({ wife: Probability, son: Probability, daughter: Probability })
      .strict(),
    /** Possible clock times for the raid to start, in minutes after midnight (the sim picks one with the seeded PRNG). */
    raidTimeOptions: z.array(MinuteOfDay).optional(),
    routines: z.array(Routine).optional(),
    complicationPool: z.array(z.string()), // complication ids
    complicationsPerRun: z
      .tuple([z.number().int().min(0), z.number().int().min(0)])
      .refine(([lo, hi]) => lo <= hi, {
        message: "complicationsPerRun must be [min, max] with min <= max",
      }),
  })
  .strict();
export type Mission = z.infer<typeof Mission>;
