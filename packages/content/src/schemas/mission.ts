import { z } from "zod";
import { Probability } from "./common";

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
    complicationPool: z.array(z.string()), // complication ids
    complicationsPerRun: z
      .tuple([z.number().int().min(0), z.number().int().min(0)])
      .refine(([lo, hi]) => lo <= hi, {
        message: "complicationsPerRun must be [min, max] with min <= max",
      }),
  })
  .strict();
export type Mission = z.infer<typeof Mission>;
