import type { FloorId, MapFile, Mission, Side } from "@war-room/content";
import type { Nav } from "./nav";

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

/** Smart-home device kinds, from the `smart:<kind>` marker tag. */
export type DeviceKind = "camera" | "motion" | "floodlight" | "lock" | "hub";
/** "looped" (a hacked camera replaying old footage) is valid for cameras only. */
export type DeviceState = "on" | "off" | "looped";
export type ShutterState = "open" | "closed";
/** 0 calm, 1 suspicious (floodlights), 2 alarm (shutters drop), 3 lockdown (locks engage). */
export type AlertLevel = 0 | 1 | 2 | 3;

export type EntityState = "idle" | "moving" | "firing" | "down";

export type Command =
  | { kind: "move"; tick: Tick; entity: EntityId; to: Pos } // week 1
  | { kind: "issuePlan"; tick: Tick; plan: Plan } // week 2
  | { kind: "decide"; tick: Tick; cardId: string; optionId: string } // week 2
  | { kind: "intervene"; tick: Tick; action: "hold" | "proceed" | "abort" }
  | { kind: "setDoor"; tick: Tick; doorId: string; state: DoorState }
  | { kind: "setDevice"; tick: Tick; deviceId: string; state: DeviceState }
  | { kind: "setShutter"; tick: Tick; windowId: string; state: ShutterState }
  | { kind: "setAlert"; tick: Tick; level: AlertLevel };

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
  /** Smart-home devices, sorted by id. */
  devices: { id: string; kind: DeviceKind; state: DeviceState }[];
  /** One per window that has a shutter, sorted by id. */
  shutters: { id: string; state: ShutterState }[];
  alert: AlertLevel;
  /** True while at least one hub device is on; with no hub the house cannot automate or report. */
  hubOnline: boolean;
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
  | (SimEventBase & { type: "device"; deviceId: string; state: DeviceState })
  | (SimEventBase & { type: "shutter"; windowId: string; state: ShutterState })
  | (SimEventBase & { type: "alert"; level: AlertLevel })
  | (SimEventBase & { type: "contact"; observer: EntityId; target: EntityId })
  // `observer` heard something. `at` is an approximate spot (the farther the sound, the larger the error); the source is never named.
  | (SimEventBase & { type: "noise"; observer: EntityId; at: Pos; kind: "steps" | "door" })
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
  /**
   * A ready navmesh (see createNav). With one, `move` commands follow a route across rooms and floors;
   * without one, units walk in a straight line on a single floor. Not part of the saved state: give a
   * restored sim the same navmesh it was saved with.
   */
  nav?: Nav;
}
