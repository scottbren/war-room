import { z } from "zod";

/** Meters. Map plane is x (east), y (north). */
export const Vec2 = z.object({ x: z.number(), y: z.number() }).strict();
export type Vec2 = z.infer<typeof Vec2>;

export const Rect = z
  .object({ min: Vec2, max: Vec2 })
  .strict()
  .refine((r) => r.min.x <= r.max.x && r.min.y <= r.max.y, {
    message: "rect.min must be <= rect.max on both axes",
  });
export type Rect = z.infer<typeof Rect>;

// "lower" is a basement under the house; "shore" (below the lawn) and "hill" (above it) are open-air levels.
export const FloorId = z.enum(["grounds", "ground", "upper", "roof", "lower", "shore", "hill"]);
export type FloorId = z.infer<typeof FloorId>;

/** Integer degrees 0-359, clockwise from north. */
export const Angle = z.number().int().min(0).max(359);
export type Angle = z.infer<typeof Angle>;

export const Side = z.enum(["operator", "defender", "civilian", "family", "principal"]);
export type Side = z.infer<typeof Side>;

/** Probability in [0, 1]. */
export const Probability = z.number().min(0).max(1);

export const Condition = z
  .object({
    path: z.string().min(1),
    op: z.enum(["eq", "neq", "gt", "lt", "in"]),
    value: z.unknown(),
  })
  .strict();
export type Condition = z.infer<typeof Condition>;

export const Effect = z
  .object({ kind: z.string().min(1), params: z.record(z.string(), z.unknown()) })
  .strict();
export type Effect = z.infer<typeof Effect>;

export const EventTrigger = z
  .object({ event: z.string().min(1), conditions: z.array(Condition) })
  .strict();
export type EventTrigger = z.infer<typeof EventTrigger>;
