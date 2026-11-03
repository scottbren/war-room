import { z } from "zod";
import { Effect, EventTrigger } from "./common";

export const DecisionOption = z
  .object({ id: z.string().min(1), label: z.string().min(1), effects: z.array(Effect) })
  .strict();
export type DecisionOption = z.infer<typeof DecisionOption>;

export const DecisionCard = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    trigger: EventTrigger,
    reserved: z.boolean(),
    defaultOptionId: z.string().optional(),
    options: z.array(DecisionOption).min(1),
  })
  .strict()
  .refine(
    (c) => c.defaultOptionId === undefined || c.options.some((o) => o.id === c.defaultOptionId),
    { message: "defaultOptionId must match one of the options", path: ["defaultOptionId"] },
  );
export type DecisionCard = z.infer<typeof DecisionCard>;

export const Complication = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    setup: z.array(Effect),
    trigger: EventTrigger,
    effects: z.array(Effect),
  })
  .strict();
export type Complication = z.infer<typeof Complication>;
