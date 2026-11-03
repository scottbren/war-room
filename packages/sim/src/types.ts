import type { FloorId, MapFile, Mission, Side } from "@war-room/content";

export type { FloorId };

/** Integer tick, 10 per second. */
export type Tick = number;
/** Stable and readable: "op.alpha.1", "def.vet.3", "fam.son". */
export type EntityId = string;
/**
 * Meters, `x` east, `y` north. Sim state quantizes x/y to 1 cm (see quantize.ts);
 * every Pos in a Snapshot, SimEvent or Command is on that grid.
 */
export type Pos = { floor: FloorId; x: number; y: number };

export type DoorState = "open" | "closed" | "locked";

export type EntityState = "idle" | "moving" | "firing" | "down";

export type Command =
  | { kind: "move"; tick: Tick; entity: EntityId; to: Pos } // week 1
  | { kind: "issuePlan"; tick: Tick; plan: Plan } // week 2
  | { kind: "decide"; tick: Tick; cardId: string; optionId: string } // week 2
  | { kind: "intervene"; tick: Tick; action: "hold" | "proceed" | "abort" }
  | { kind: "setDoor"; tick: Tick; doorId: string; state: DoorState };

export interface EntitySnapshot {
  id: EntityId;
  side: Side;
  pos: Pos;
  /** Integer degrees 0-359, clockwise from north. */
  facing: number;
  /** Integer. */
  health: number;
  state: EntityState;
}

export interface Snapshot {
  tick: Tick;
  /** Sorted by id. */
  entities: EntitySnapshot[];
  /** Sorted by id. */
  doors: { id: string; state: DoorState }[];
}

export interface SimEventBase {
  /** Derived from tick plus a per-tick counter, e.g. "12.0". Never from clocks or randomness. */
  id: string;
  tick: Tick;
  type: string;
  v: 1;
}

export type SimEvent =
  | (SimEventBase & { type: "moved"; entity: EntityId; to: Pos })
  | (SimEventBase & { type: "arrived"; entity: EntityId })
  | (SimEventBase & { type: "door"; doorId: string; state: DoorState })
  | (SimEventBase & { type: "contact"; observer: EntityId; target: EntityId })
  // Emitted when a command targets a tick that has already passed (see T3).
  | (SimEventBase & { type: "commandRejected"; command: Command["kind"]; reason: string });
// more event types are added in week 2 under the same base

export interface PlanTask {
  team: string;
  action: "move" | "clear" | "hold" | "breach" | "overwatch" | "search" | "extract" | "evacuate";
  target: { roomId?: string; at?: Pos; entity?: EntityId };
  conditions?: string[];
  rules?: string[];
}

export interface Plan {
  id: string;
  issuedBy: string;
  intent: string;
  tasks: PlanTask[];
}

export interface Sim {
  /**
   * Commands apply on their `tick`. Commands sharing a tick apply in enqueue order.
   * A command for a tick that has already passed is rejected with a `commandRejected` event.
   */
  enqueue(cmd: Command): void;
  /** Advances exactly one tick. */
  step(): { snapshot: Snapshot; events: SimEvent[] };
  /** Hash of full state. */
  hash(): string;
  serialize(): string;
  /** Replaces this sim's state with a string produced by `serialize()`. */
  restore(serialized: string): void;
}

export interface CreateSimOptions {
  seed: number;
  map: MapFile;
  mission?: Mission;
}
