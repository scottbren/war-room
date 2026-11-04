import { FloorId, Side } from "@war-room/content";
import type { MapFile } from "@war-room/content";
import { DEFAULT_HEALTH } from "./defaults";
import { canonicalize, hashState } from "./hash";
import { pipeline } from "./pipeline";
import { fromCm, quantizePos, toCm } from "./quantize";
import { createRng } from "./rng";
import type { Rng } from "./rng";
import { createCtx } from "./systems/context";
import { hubOnline } from "./systems/smart-home";
import type { AlertLevel, Command, CreateSimOptions, DeviceKind, DeviceState, DoorState, EntityState, ShutterState, Sim, Snapshot } from "./types";
import { addEntity, createWorld, sortedDeviceIds, sortedDoorIds, sortedEntities, sortedShutterIds } from "./world";
import type { Device, Entity, QueuedCommand, Waypoint, World } from "./world";

const STATE_VERSION = 2;

const DEVICE_KINDS: readonly string[] = ["camera", "motion", "floodlight", "lock", "hub"];
const DEVICE_STATES: readonly string[] = ["on", "off", "looped"];
const SHUTTER_STATES: readonly string[] = ["open", "closed"];

/** Plain-data form of the whole simulation state; what gets hashed and serialized. */
interface SimState {
  v: number;
  map: { id: string; version: number };
  tick: number;
  seq: number;
  rng: number[];
  entities: Entity[];
  doors: { id: string; state: DoorState }[];
  devices: { id: string; kind: DeviceKind; state: DeviceState; door?: string }[];
  shutters: { id: string; state: ShutterState }[];
  alert: AlertLevel;
  alertApplied: AlertLevel;
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

  for (const floor of map.floors) {
    for (const win of floor.windows) {
      if (win.shutter) world.shutters[win.id] = "open";
    }
  }

  for (const marker of map.markers) {
    const smartKind = tagValue(marker.tags, "smart");
    if (smartKind === undefined) continue;
    if (!DEVICE_KINDS.includes(smartKind)) throw new Error(`marker ${marker.id} has an unknown smart device kind: ${smartKind}`);
    const device: Device = { kind: smartKind as DeviceKind, state: smartKind === "floodlight" ? "off" : "on" };
    if (smartKind === "lock") {
      const door = tagValue(marker.tags, "door");
      if (door === undefined || !Object.hasOwn(world.doors, door)) {
        throw new Error(`lock marker ${marker.id} names a door that does not exist: ${door ?? "(no door: tag)"}`);
      }
      device.door = door;
    }
    if (Object.hasOwn(world.devices, marker.id)) throw new Error(`duplicate device id: ${marker.id}`);
    world.devices[marker.id] = device;
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
    devices: sortedDeviceIds(world).map((id) => {
      const d = world.devices[id] as Device;
      return { id, kind: d.kind, state: d.state, ...(d.door !== undefined ? { door: d.door } : {}) };
    }),
    shutters: sortedShutterIds(world).map((id) => ({ id, state: world.shutters[id] as ShutterState })),
    alert: world.alert,
    alertApplied: world.alertApplied,
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
    case "setDevice":
      if (typeof c["deviceId"] !== "string") return "queued setDevice has no device";
      return typeof c["state"] === "string" && DEVICE_STATES.includes(c["state"]) ? undefined : "queued setDevice has an invalid state";
    case "setShutter":
      if (typeof c["windowId"] !== "string") return "queued setShutter has no window";
      return typeof c["state"] === "string" && SHUTTER_STATES.includes(c["state"]) ? undefined : "queued setShutter has an invalid state";
    case "setAlert":
      return isInt(c["level"]) && c["level"] >= 0 && c["level"] <= 3 ? undefined : "queued setAlert has an invalid level";
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
    if (motion["toFloor"] !== undefined) {
      const toFloor = FloorId.safeParse(motion["toFloor"]);
      if (!toFloor.success) return fail(`entity ${id} has invalid motion`);
      entity.motion.toFloor = toFloor.data;
    }
    if (motion["rest"] !== undefined) {
      const rest = motion["rest"];
      if (!Array.isArray(rest) || rest.length === 0) return fail(`entity ${id} has invalid motion`);
      entity.motion.rest = rest.map((w): Waypoint => {
        const floor = isRecord(w) ? FloorId.safeParse(w["floor"]) : undefined;
        if (!isRecord(w) || !floor?.success || !isInt(w["xCm"]) || !isInt(w["yCm"])) return fail(`entity ${id} has an invalid route`);
        return { floor: floor.data, xCm: w["xCm"], yCm: w["yCm"] };
      });
    }
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
  const { tick, seq, rng, entities, doors, queue, devices, shutters, alert, alertApplied } = raw;
  if (!isInt(tick) || tick < 0 || !isInt(seq) || seq < 0) return fail("invalid tick or seq");
  if (!Array.isArray(rng) || rng.length !== 4) return fail("invalid rng state");
  if (!Array.isArray(entities) || !Array.isArray(doors) || !Array.isArray(queue) || !Array.isArray(devices) || !Array.isArray(shutters)) {
    return fail("state is missing fields");
  }
  if (!isInt(alert) || alert < 0 || alert > 3 || !isInt(alertApplied) || alertApplied < 0 || alertApplied > alert) return fail("invalid alert level");

  const world = createWorld();
  world.tick = tick;
  world.seq = seq;
  world.alert = alert as AlertLevel;
  world.alertApplied = alertApplied as AlertLevel;

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

  const expected = buildWorld(map);
  for (const d of devices) {
    const known = isRecord(d) && typeof d["id"] === "string" && Object.hasOwn(expected.devices, d["id"]) ? expected.devices[d["id"]] : undefined;
    if (!isRecord(d) || !known || typeof d["id"] !== "string") return fail("device is not on the map");
    if (d["kind"] !== known.kind) return fail(`device ${d["id"]} has the wrong kind`);
    if (typeof d["state"] !== "string" || !DEVICE_STATES.includes(d["state"]) || (d["state"] === "looped" && known.kind !== "camera")) {
      return fail(`device ${d["id"]} has an invalid state`);
    }
    if (Object.hasOwn(world.devices, d["id"])) return fail(`duplicate device ${d["id"]}`);
    world.devices[d["id"]] = { ...known, state: d["state"] as DeviceState };
  }
  if (Object.keys(world.devices).length !== Object.keys(expected.devices).length) return fail("a device is missing");
  for (const sh of shutters) {
    if (!isRecord(sh) || typeof sh["id"] !== "string" || !Object.hasOwn(expected.shutters, sh["id"])) return fail("shutter is not on the map");
    if (typeof sh["state"] !== "string" || !SHUTTER_STATES.includes(sh["state"])) return fail(`shutter ${sh["id"]} has an invalid state`);
    if (Object.hasOwn(world.shutters, sh["id"])) return fail(`duplicate shutter ${sh["id"]}`);
    world.shutters[sh["id"]] = sh["state"] as ShutterState;
  }
  if (Object.keys(world.shutters).length !== Object.keys(expected.shutters).length) return fail("a shutter is missing");

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
    devices: sortedDeviceIds(world).map((id) => {
      const d = world.devices[id] as Device;
      return { id, kind: d.kind, state: d.state };
    }),
    shutters: sortedShutterIds(world).map((id) => ({ id, state: world.shutters[id] as ShutterState })),
    alert: world.alert,
    hubOnline: hubOnline(world),
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
      const ctx = createCtx(world.tick + 1, rng, opts.nav);
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
