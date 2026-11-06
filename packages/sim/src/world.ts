import type { FloorId, Side } from "@war-room/content";
import type { MissionSetup } from "./mission";
import type { AlertLevel, Command, DeviceKind, DeviceState, DoorState, EntityState, ShutterState } from "./types";

/** Position in integer centimeters. */
export interface EntityPos {
  floor: FloorId;
  xCm: number;
  yCm: number;
}

/** A point on a route, in integer centimeters. */
export interface Waypoint {
  floor: FloorId;
  xCm: number;
  yCm: number;
}

export interface Motion {
  toXCm: number;
  toYCm: number;
  /** Floor the unit is on once it reaches (toXCm, toYCm); omitted means it stays on its current floor. */
  toFloor?: FloorId;
  speedCmPerTick: number;
  /** Waypoints after the current target, in order (a navmesh route). Omitted when there are none. */
  rest?: Waypoint[];
}

/** Entity with optional components. All numbers are integers. */
export interface Entity {
  id: string;
  side: Side;
  pos: EntityPos;
  /** Integer degrees 0-359. */
  facing: number;
  health: number;
  state: EntityState;
  motion?: Motion;
}

/**
 * A defender's state of mind, kept only while it differs from "standing at its post, unaware". `routine` appears only
 * while a radio report is on its way to a defender that is otherwise unaware.
 */
export interface Mind {
  mode: "routine" | "suspicious" | "alerted" | "returning";
  /** Where the defender goes back to. */
  post: EntityPos;
  /** What it is interested in: the place it heard something, or the last place an operator was seen. */
  spot: EntityPos;
  /** Tick of the latest sighting, sound or report that set `spot`. */
  t: number;
  /** Suspicious: the tick it reached the spot (it searches there for a while). */
  waitFrom?: number;
  /** A radio report from another defender, arriving at tick `due`. */
  relay?: { due: number; spot: EntityPos };
}

export interface QueuedCommand {
  /** Enqueue order, the tiebreak for commands sharing a tick. */
  seq: number;
  command: Command;
}

export interface Device {
  kind: DeviceKind;
  state: DeviceState;
  /** Lock devices: the door they secure. */
  door?: string;
}

export interface World {
  /** Number of completed ticks. */
  tick: number;
  /** Next enqueue sequence number. */
  seq: number;
  entities: Record<string, Entity>;
  doors: Record<string, DoorState>;
  devices: Record<string, Device>;
  shutters: Record<string, ShutterState>;
  alert: AlertLevel;
  /** Highest alert level whose automation has already run (edge trigger). */
  alertApplied: AlertLevel;
  queue: QueuedCommand[];
  /** Rolled mission facts (raid time, drive location); present only when the sim was created with a mission. */
  setup?: MissionSetup;
  /** Perception memory: "observer>target" for each pair currently in view, with the tick of its last `contact` event. */
  sight: Record<string, number>;
  /** Defenders that are not simply at their post, by id. */
  minds: Record<string, Mind>;
}

export function createWorld(): World {
  // Null-prototype records so ids like "__proto__" are ordinary keys.
  return { tick: 0, seq: 0, entities: Object.create(null), doors: Object.create(null), devices: Object.create(null), shutters: Object.create(null), alert: 0, alertApplied: 0, queue: [], sight: Object.create(null), minds: Object.create(null) };
}

export function addEntity(world: World, entity: Entity): void {
  if (Object.hasOwn(world.entities, entity.id)) {
    throw new Error(`duplicate entity id: ${entity.id}`);
  }
  world.entities[entity.id] = entity;
}

/** Entity ids in sorted order. Always iterate through this, never the record directly. */
export function sortedIds(world: World): string[] {
  return Object.keys(world.entities).sort();
}

export function sortedEntities(world: World): Entity[] {
  return sortedIds(world).map((id) => world.entities[id] as Entity);
}

export function sortedDoorIds(world: World): string[] {
  return Object.keys(world.doors).sort();
}

export function sortedDeviceIds(world: World): string[] {
  return Object.keys(world.devices).sort();
}

export function sortedShutterIds(world: World): string[] {
  return Object.keys(world.shutters).sort();
}
