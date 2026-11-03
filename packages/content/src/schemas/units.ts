import { z } from "zod";
import { Side } from "./common";

export const UnitType = z
  .object({
    id: z.string().min(1),
    side: Side,
    speed: z.number().positive(), // meters per second
    health: z.number().positive(),
    sightRange: z.number().positive(), // meters
    nightVision: z.boolean(),
    loyalty: z.enum(["hired", "veteran", "inner-circle"]).optional(),
  })
  .strict();
export type UnitType = z.infer<typeof UnitType>;

export const Team = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    side: Side,
    members: z.array(z.string().min(1)), // entity ids
  })
  .strict();
export type Team = z.infer<typeof Team>;

export const Equipment = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.string().min(1),
    effects: z.record(z.string(), z.number()),
  })
  .strict();
export type Equipment = z.infer<typeof Equipment>;
