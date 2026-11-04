import type { Nav } from "../nav";
import type { Rng } from "../rng";
import type { SimEvent } from "../types";
import type { World } from "../world";
import type { SightEnv } from "./perception";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventInput = DistributiveOmit<SimEvent, "id" | "tick" | "v">;

/** Per-tick context handed to every system. */
export interface Ctx {
  /** The tick being completed (world.tick + 1). Stamped on events. */
  tick: number;
  rng: Rng;
  /** Navmesh for routing moves; absent in sims built without one (straight-line movement). */
  nav?: Nav;
  /** Line-of-sight environment for perception; absent in contexts built without one (perception then does nothing). */
  sight?: SightEnv;
  events: SimEvent[];
  /** Adds an event with id "<tick>.<index>". */
  emit(event: EventInput): void;
}

export type System = (world: World, ctx: Ctx) => void;

export function createCtx(tick: number, rng: Rng, nav?: Nav, sight?: SightEnv): Ctx {
  const events: SimEvent[] = [];
  return {
    tick,
    rng,
    ...(nav ? { nav } : {}),
    ...(sight ? { sight } : {}),
    events,
    emit(event) {
      events.push({ ...event, id: `${tick}.${events.length}`, tick, v: 1 } as SimEvent);
    },
  };
}
