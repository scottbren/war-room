import type { FloorId, MapFile, Mission } from "@war-room/content";

export type { FloorId };

/** Integer tick, 10 per second. */
export type Tick = number;
/** Stable and readable: "op.alpha.1", "def.vet.3", "fam.son". */
export type EntityId = string;
/** Meters. `x` east, `y` north. */
export type Pos = { floor: FloorId; x: number; y: number };

export type DoorState = "open" | "closed" | "locked";

export type Command =
  | { kind: "move"; tick: Tick; entity: EntityId; to: Pos } // week 1
  | { kind: "issuePlan"; tick: Tick; plan: Plan } // week 2
  | { kind: "decide"; tick: Tick; cardId: string; optionId: string } // week 2
  | { kind: "intervene"; tick: Tick; action: "hold" | "proceed" | "abort" }
  | { kind: "setDoor"; tick: Tick; doorId: string; state: DoorState };

export interface EntitySnapshot {
  id: EntityId;
  side: string;
  pos: Pos;
  /** Integer degrees 0-359, clockwise from north. */
  facing: number;
  health: number;
  /** "idle" | "moving" | "firing" | "down" ... */
  state: string;
}

export interface Snapshot {
  tick: Tick;
  /** Sorted by id. */
  entities: EntitySnapshot[];
  doors: Record<string, string>;
}

export interface SimEventBase {
  id: string;
  tick: Tick;
  type: string;
  v: 1;
}

export type SimEvent =
  | (SimEventBase & { type: "moved"; entity: EntityId; to: Pos })
  | (SimEventBase & { type: "arrived"; entity: EntityId })
  | (SimEventBase & { type: "door"; doorId: string; state: string })
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
