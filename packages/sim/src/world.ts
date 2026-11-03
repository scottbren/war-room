import type { FloorId, Side } from "@war-room/content";
import type { Command, DoorState, EntityState } from "./types";

/** Position in integer centimeters. */
export interface EntityPos {
  floor: FloorId;
  xCm: number;
  yCm: number;
}

export interface Motion {
  toXCm: number;
  toYCm: number;
  speedCmPerTick: number;
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

export interface QueuedCommand {
  /** Enqueue order, the tiebreak for commands sharing a tick. */
  seq: number;
  command: Command;
}

export interface World {
  /** Number of completed ticks. */
  tick: number;
  /** Next enqueue sequence number. */
  seq: number;
  entities: Record<string, Entity>;
  doors: Record<string, DoorState>;
  queue: QueuedCommand[];
}

export function createWorld(): World {
  // Null-prototype records so ids like "__proto__" are ordinary keys.
  return { tick: 0, seq: 0, entities: Object.create(null), doors: Object.create(null), queue: [] };
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
