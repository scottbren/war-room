import type { Pos, Snapshot, SimEvent } from "@war-room/sim";

/** Messages between the page and the simulation worker. */
export type ToWorker =
  | { type: "init"; seed: number; map: string; peaceful?: boolean }
  /** Move a unit to the first of these points that is walkable (a click can hit several floors). */
  | { type: "moveTo"; entity: string; candidates: Pos[] };

export type FromWorker =
  | { type: "ready"; snapshot: Snapshot }
  | { type: "tick"; snapshot: Snapshot; events: SimEvent[] }
  | { type: "error"; message: string };
