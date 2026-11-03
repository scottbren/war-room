import type { Rng } from "../rng";
import type { SimEvent } from "../types";
import type { World } from "../world";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventInput = DistributiveOmit<SimEvent, "id" | "tick" | "v">;

/** Per-tick context handed to every system. */
export interface Ctx {
  /** The tick being completed (world.tick + 1). Stamped on events. */
  tick: number;
  rng: Rng;
  events: SimEvent[];
  /** Adds an event with id "<tick>.<index>". */
  emit(event: EventInput): void;
}

export type System = (world: World, ctx: Ctx) => void;

export function createCtx(tick: number, rng: Rng): Ctx {
  const events: SimEvent[] = [];
  return {
    tick,
    rng,
    events,
    emit(event) {
      events.push({ ...event, id: `${tick}.${events.length}`, tick, v: 1 } as SimEvent);
    },
  };
}
