import { FloorId, Side } from "@war-room/content";
import type { MapFile } from "@war-room/content";
import { DEFAULT_HEALTH } from "./defaults";
import { canonicalize, hashState } from "./hash";
import { pipeline } from "./pipeline";
import { fromCm, quantizePos, toCm } from "./quantize";
import { createRng } from "./rng";
import type { Rng } from "./rng";
import { createCtx } from "./systems/context";
import type { Command, CreateSimOptions, DoorState, EntityState, Sim, Snapshot } from "./types";
import { addEntity, createWorld, sortedDoorIds, sortedEntities } from "./world";
import type { Entity, QueuedCommand, World } from "./world";

const STATE_VERSION = 1;

/** Plain-data form of the whole simulation state; what gets hashed and serialized. */
interface SimState {
  v: number;
  map: { id: string; version: number };
  tick: number;
  seq: number;
  rng: number[];
  entities: Entity[];
  doors: { id: string; state: DoorState }[];
  queue: QueuedCommand[];
}

function tagValue(tags: string[], prefix: string): string | undefined {
  const hit = tags.find((t) => t.startsWith(`${prefix}:`));
  return hit?.slice(prefix.length + 1);
}

/**
 * Spawn marker convention: tags `entity:<id>` and `side:<side>`; position is `at`.
 */
function buildWorld(map: MapFile): World {
  const world = createWorld();

  for (const floor of map.floors) {
    for (const door of floor.doors) {
      if (Object.hasOwn(world.doors, door.id)) throw new Error(`duplicate door id: ${door.id}`);
      world.doors[door.id] = door.state;
    }
  }

  for (const marker of map.markers) {
    if (marker.kind !== "spawn") continue;
    const id = tagValue(marker.tags, "entity");
    const side = Side.safeParse(tagValue(marker.tags, "side"));
    if (!id || !side.success || !marker.at) {
      throw new Error(`spawn marker ${marker.id} needs an "entity:<id>" tag, a valid "side:<side>" tag and an "at" position`);
    }
    addEntity(world, {
      id,
      side: side.data,
      pos: { floor: marker.floor, xCm: toCm(marker.at.x), yCm: toCm(marker.at.y) },
      facing: 0,
      health: DEFAULT_HEALTH,
      state: "idle",
    });
  }
  return world;
}

function toState(map: MapFile, world: World, rng: Rng): SimState {
  return {
    v: STATE_VERSION,
    map: { id: map.id, version: map.version },
    tick: world.tick,
    seq: world.seq,
    rng: [...rng.state()],
    entities: sortedEntities(world),
    doors: sortedDoorIds(world).map((id) => ({ id, state: world.doors[id] as DoorState })),
    queue: [...world.queue].sort((a, b) => a.seq - b.seq),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const fail = (why: string): never => {
  throw new Error(`restore: ${why}`);
};

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const ENTITY_STATES: readonly string[] = ["idle", "moving", "firing", "down"];
const DOOR_STATES: readonly string[] = ["open", "closed", "locked"];

const onGrid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && fromCm(toCm(v)) === v;

/** Returns why a raw queued command is invalid, or undefined if it is fine. */
function commandProblem(c: unknown, doorIds: ReadonlySet<string>): string | undefined {
  if (!isRecord(c)) return "queued command is not an object";
  if (!isInt(c["tick"]) || c["tick"] < 0) return "queued command has an invalid tick";
  switch (c["kind"]) {
    case "move": {
      const to = c["to"];
      if (typeof c["entity"] !== "string") return "queued move has no entity";
      if (!isRecord(to) || !FloorId.safeParse(to["floor"]).success || !onGrid(to["x"]) || !onGrid(to["y"])) {
        return "queued move has an invalid target";
      }
      return undefined;
    }
    case "setDoor":
      if (typeof c["doorId"] !== "string" || !doorIds.has(c["doorId"])) return "queued setDoor names an unknown door";
      if (typeof c["state"] !== "string" || !DOOR_STATES.includes(c["state"])) return "queued setDoor has an invalid state";
      return undefined;
    case "issuePlan":
      return isRecord(c["plan"]) ? undefined : "queued issuePlan has no plan";
    case "decide":
      return typeof c["cardId"] === "string" && typeof c["optionId"] === "string" ? undefined : "queued decide is incomplete";
    case "intervene":
      return c["action"] === "hold" || c["action"] === "proceed" || c["action"] === "abort" ? undefined : "queued intervene has an invalid action";
    default:
      return "queued command has an unknown kind";
  }
}

function parseEntity(raw: unknown): Entity {
  if (!isRecord(raw)) return fail("entity is not an object");
  const { id, side, pos, facing, health, state, motion } = raw;
  if (typeof id !== "string" || id === "") return fail("entity without an id");
  const sideOk = Side.safeParse(side);
  if (!sideOk.success) return fail(`entity ${id} has an invalid side`);
  if (!isRecord(pos)) return fail(`entity ${id} has no pos`);
  const floorOk = FloorId.safeParse(pos["floor"]);
  if (!floorOk.success || !isInt(pos["xCm"]) || !isInt(pos["yCm"])) return fail(`entity ${id} has an invalid pos`);
  if (!isInt(facing) || facing < 0 || facing > 359) return fail(`entity ${id} has an invalid facing`);
  if (!isInt(health) || health < 0) return fail(`entity ${id} has invalid health`);
  if (typeof state !== "string" || !ENTITY_STATES.includes(state)) return fail(`entity ${id} has an invalid state`);

  const entity: Entity = {
    id,
    side: sideOk.data,
    pos: { floor: floorOk.data, xCm: pos["xCm"], yCm: pos["yCm"] },
    facing,
    health,
    state: state as EntityState,
  };
  if (motion !== undefined) {
    if (!isRecord(motion) || !isInt(motion["toXCm"]) || !isInt(motion["toYCm"]) || !isInt(motion["speedCmPerTick"]) || motion["speedCmPerTick"] <= 0) {
      return fail(`entity ${id} has invalid motion`);
    }
    entity.motion = { toXCm: motion["toXCm"], toYCm: motion["toYCm"], speedCmPerTick: motion["speedCmPerTick"] };
  }
  return entity;
}

/** Parses and fully validates serialized state without touching any live sim. */
function parseState(text: string, map: MapFile): { world: World; rng: number[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("not valid JSON");
  }
  if (!isRecord(raw) || raw["v"] !== STATE_VERSION) return fail("unrecognized state");
  const m = raw["map"];
  if (!isRecord(m) || m["id"] !== map.id || m["version"] !== map.version) {
    return fail("state was saved from a different map or map version");
  }
  const { tick, seq, rng, entities, doors, queue } = raw;
  if (!isInt(tick) || tick < 0 || !isInt(seq) || seq < 0) return fail("invalid tick or seq");
  if (!Array.isArray(rng) || rng.length !== 4) return fail("invalid rng state");
  if (!Array.isArray(entities) || !Array.isArray(doors) || !Array.isArray(queue)) return fail("state is missing fields");

  const world = createWorld();
  world.tick = tick;
  world.seq = seq;

  for (const e of entities) {
    const entity = parseEntity(e);
    if (Object.hasOwn(world.entities, entity.id)) return fail(`duplicate entity ${entity.id}`);
    world.entities[entity.id] = entity;
  }

  const expectedDoors = buildWorld(map).doors;
  for (const d of doors) {
    if (!isRecord(d) || typeof d["id"] !== "string" || !Object.hasOwn(expectedDoors, d["id"])) {
      return fail("door is not on the map");
    }
    if (typeof d["state"] !== "string" || !DOOR_STATES.includes(d["state"])) return fail(`door ${d["id"]} has an invalid state`);
    if (Object.hasOwn(world.doors, d["id"])) return fail(`duplicate door ${d["id"]}`);
    world.doors[d["id"]] = d["state"] as DoorState;
  }
  if (Object.keys(world.doors).length !== Object.keys(expectedDoors).length) return fail("a door is missing");

  const seen = new Set<number>();
  for (const q of queue) {
    if (!isRecord(q) || !isInt(q["seq"]) || q["seq"] < 0 || q["seq"] >= seq || seen.has(q["seq"])) {
      return fail("invalid or duplicate queue seq");
    }
    seen.add(q["seq"]);
    const c = q["command"];
    const problem = commandProblem(c, new Set(Object.keys(expectedDoors)));
    if (problem) return fail(problem);
    world.queue.push({ seq: q["seq"], command: c as unknown as Command });
  }
  return { world, rng: rng as number[] };
}

export function createSim(opts: CreateSimOptions): Sim {
  const { map } = opts;
  let world = buildWorld(map);
  const rng = createRng(opts.seed);

  const snapshot = (): Snapshot => ({
    tick: world.tick,
    entities: sortedEntities(world).map((e) => ({
      id: e.id,
      side: e.side,
      pos: { floor: e.pos.floor, x: fromCm(e.pos.xCm), y: fromCm(e.pos.yCm) },
      facing: e.facing,
      health: e.health,
      state: e.state,
    })),
    doors: sortedDoorIds(world).map((id) => ({ id, state: world.doors[id] as DoorState })),
  });

  return {
    enqueue(cmd: Command): void {
      if (!Number.isInteger(cmd.tick) || cmd.tick < 0) {
        throw new Error(`enqueue: tick must be a non-negative integer, got ${cmd.tick}`);
      }
      // Copy so later caller mutation can't change the queue; snap move targets to the cm grid
      // so the queued value is identical before and after a serialize/restore round trip.
      const snapped: Command = cmd.kind === "move" ? { ...cmd, to: quantizePos(cmd.to) } : cmd;
      // Round-trip through the canonical form so the queued value is exactly what
      // serialize() will write and restore() will read back (also copies the command).
      const command = JSON.parse(canonicalize(snapped)) as Command;
      world.queue.push({ seq: world.seq++, command });
    },

    step() {
      const ctx = createCtx(world.tick + 1, rng);
      for (const system of pipeline) system(world, ctx);
      world.tick += 1;
      return { snapshot: snapshot(), events: ctx.events };
    },

    hash: () => hashState(toState(map, world, rng)),

    serialize: () => canonicalize(toState(map, world, rng)),

    restore(serialized: string): void {
      const parsed = parseState(serialized, map);
      rng.restore(parsed.rng as unknown as readonly [number, number, number, number]);
      world = parsed.world;
    },
  };
}
