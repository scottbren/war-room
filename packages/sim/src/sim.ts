import { FloorId, Side } from "@war-room/content";
import type { MapFile } from "@war-room/content";
import { DEFAULT_HEALTH, SUPPRESS_MAX } from "./defaults";
import { canonicalize, hashState } from "./hash";
import { pipeline } from "./pipeline";
import { fromCm, quantizePos, toCm } from "./quantize";
import { planMission } from "./mission";
import type { MissionSetup } from "./mission";
import { createRng } from "./rng";
import type { Rng } from "./rng";
import { createCtx } from "./systems/context";
import { createSightEnv } from "./systems/perception";
import { hubOnline } from "./systems/smart-home";
import type { AlertLevel, Command, CreateSimOptions, DeviceKind, DeviceState, DoorState, EntityState, ShutterState, Sim, Snapshot } from "./types";
import { addEntity, createWorld, sortedDeviceIds, sortedDoorIds, sortedEntities, sortedShutterIds } from "./world";
import type { Device, Entity, EntityPos, Mind, QueuedCommand, Waypoint, World } from "./world";

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
  /** Only present for a sim created with a mission, so runs without one hash exactly as before. */
  setup?: MissionSetup;
  /** Pairs in view with their last contact tick, sorted by key; only present when someone is in view, so quiet runs hash as before. */
  sight?: { k: string; t: number }[];
  /** Suppression of units under fire, sorted by id; only present when there is any. */
  suppression?: { id: string; v: number }[];
  /** Defenders that are not simply at their post, sorted by id; only present when there are any. */
  minds?: ({ id: string } & Mind)[];
  /** Evidence defenders have noticed, sorted by key; only present when there is any. */
  noticed?: { k: string; t: number }[];
}

/** A spawn marker's `facing:<degrees>` tag (clockwise from north, whole degrees); 0 when absent. A malformed tag is an error. */
function facingTag(tags: string[]): number {
  const raw = tagValue(tags, "facing");
  if (raw === undefined) return 0;
  if (!/^-?\d{1,4}$/.test(raw)) throw new Error(`spawn marker has a bad facing tag: facing:${raw} (use whole degrees, e.g. facing:180)`);
  return ((Number(raw) % 360) + 360) % 360;
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
      facing: facingTag(marker.tags),
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
    ...(world.setup !== undefined ? { setup: world.setup } : {}),
    ...(Object.keys(world.noticed).length > 0 ? { noticed: Object.keys(world.noticed).sort().map((k) => ({ k, t: world.noticed[k] as number })) } : {}),
    ...(Object.keys(world.minds).length > 0 ? { minds: Object.keys(world.minds).sort().map((id) => ({ id, ...(world.minds[id] as Mind) })) } : {}),
    ...(Object.keys(world.suppression).length > 0 ? { suppression: Object.keys(world.suppression).sort().map((id) => ({ id, v: world.suppression[id] as number })) } : {}),
    ...(Object.keys(world.sight).length > 0 ? { sight: Object.keys(world.sight).sort().map((k) => ({ k, t: world.sight[k] as number })) } : {}),
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
  const { id, side, pos, facing, health, state, motion, reload } = raw;
  if (typeof id !== "string" || id === "") return fail("entity without an id");
  const sideOk = Side.safeParse(side);
  if (!sideOk.success) return fail(`entity ${id} has an invalid side`);
  if (!isRecord(pos)) return fail(`entity ${id} has no pos`);
  const floorOk = FloorId.safeParse(pos["floor"]);
  if (!floorOk.success || !isInt(pos["xCm"]) || !isInt(pos["yCm"])) return fail(`entity ${id} has an invalid pos`);
  if (!isInt(facing) || facing < 0 || facing > 359) return fail(`entity ${id} has an invalid facing`);
  if (!isInt(health) || health < 0) return fail(`entity ${id} has invalid health`);
  if (typeof state !== "string" || !ENTITY_STATES.includes(state)) return fail(`entity ${id} has an invalid state`);

  if (state === "down" && (health !== 0 || motion !== undefined)) return fail(`entity ${id} is down but has health or motion`);
  const entity: Entity = {
    id,
    side: sideOk.data,
    pos: { floor: floorOk.data, xCm: pos["xCm"], yCm: pos["yCm"] },
    facing,
    health,
    state: state as EntityState,
  };
  if (reload !== undefined) {
    if (!isInt(reload) || reload < 0 || state === "down") return fail(`entity ${id} has an invalid reload`);
    entity.reload = reload;
  }
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
  const { tick, seq, rng, entities, doors, queue, devices, shutters, alert, alertApplied, setup, sight, minds, noticed, suppression } = raw;
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

  if (setup !== undefined) {
    if (!isRecord(setup)) return fail("invalid mission setup");
    if (Object.keys(setup).some((k) => k !== "raidMinute" && k !== "driveMarker")) return fail("mission setup has unknown fields");
    const { raidMinute, driveMarker } = setup;
    if (raidMinute !== undefined && (!isInt(raidMinute) || raidMinute < 0 || raidMinute > 1439)) return fail("invalid raid time");
    if (driveMarker !== undefined && (typeof driveMarker !== "string" || !map.markers.some((m) => m.id === driveMarker && m.at !== undefined))) return fail("invalid drive marker");
    world.setup = { ...(raidMinute !== undefined ? { raidMinute } : {}), ...(driveMarker !== undefined ? { driveMarker } : {}) };
  }

  if (sight !== undefined) {
    if (!Array.isArray(sight)) return fail("invalid sight memory");
    for (const s of sight) {
      if (!isRecord(s) || typeof s["k"] !== "string" || !s["k"].includes(">") || !isInt(s["t"]) || s["t"] < 0 || s["t"] > tick) return fail("invalid sight memory");
      if (Object.hasOwn(world.sight, s["k"])) return fail("duplicate sight memory");
      world.sight[s["k"]] = s["t"];
    }
  }

  for (const e of entities) {
    const entity = parseEntity(e);
    if (Object.hasOwn(world.entities, entity.id)) return fail(`duplicate entity ${entity.id}`);
    world.entities[entity.id] = entity;
  }

  for (const key of Object.keys(world.sight)) {
    const named = Object.keys(world.entities).some((o) => key.startsWith(`${o}>`) && Object.hasOwn(world.entities, key.slice(o.length + 1)));
    if (!named) return fail("sight memory names a unit that is not in the state");
  }

  if (minds !== undefined) {
    if (!Array.isArray(minds)) return fail("invalid defender minds");
    const floors = map.floors.map((f) => f.id as string);
    const pos = (v: unknown): EntityPos => {
      if (!isRecord(v) || typeof v["floor"] !== "string" || !floors.includes(v["floor"]) || !isInt(v["xCm"]) || !isInt(v["yCm"])) return fail("invalid defender mind position");
      return { floor: v["floor"] as EntityPos["floor"], xCm: v["xCm"], yCm: v["yCm"] };
    };
    for (const raw of minds) {
      if (!isRecord(raw) || typeof raw["id"] !== "string") return fail("invalid defender mind");
      const id = raw["id"];
      const who = world.entities[id];
      if (!who || who.side !== "defender") return fail("a defender mind names a unit that is not a defender in the state");
      if (Object.hasOwn(world.minds, id)) return fail("duplicate defender mind");
      if (Object.keys(raw).some((k) => !["id", "mode", "post", "spot", "t", "waitFrom", "relay", "cover", "fallback"].includes(k))) return fail("a defender mind has unknown fields");
      if (who.state === "down") return fail("a downed defender cannot have a mind");
      const mode = raw["mode"];
      if (mode !== "routine" && mode !== "suspicious" && mode !== "alerted" && mode !== "returning") return fail("invalid defender mind mode");
      const t = raw["t"];
      if (!isInt(t) || t < 0 || t > tick) return fail("invalid defender mind time");
      const waitFrom = raw["waitFrom"];
      if (waitFrom !== undefined && (!isInt(waitFrom) || waitFrom < 0 || waitFrom > tick)) return fail("invalid defender mind wait");
      const relay = raw["relay"];
      let parsedRelay: Mind["relay"];
      if (relay !== undefined) {
        if (!isRecord(relay) || !isInt(relay["due"]) || relay["due"] < 0) return fail("invalid defender mind relay");
        if (relay["camera"] !== undefined && relay["camera"] !== true) return fail("invalid defender mind relay");
        parsedRelay = { due: relay["due"], spot: pos(relay["spot"]), ...(relay["camera"] === true ? { camera: true as const } : {}) };
      }
      const coverSpot = raw["cover"] !== undefined ? pos(raw["cover"]) : undefined;
      const fallback = raw["fallback"];
      if (fallback !== undefined && fallback !== true) return fail("invalid defender mind fallback");
      if ((coverSpot !== undefined || fallback === true) && mode !== "alerted") return fail("only an alerted defender can have a cover spot or be falling back");
      if (mode === "routine" && parsedRelay === undefined) return fail("a routine defender mind needs a pending radio report");
      world.minds[id] = { mode, post: pos(raw["post"]), spot: pos(raw["spot"]), t, ...(waitFrom !== undefined ? { waitFrom } : {}), ...(parsedRelay ? { relay: parsedRelay } : {}), ...(coverSpot ? { cover: coverSpot } : {}), ...(fallback === true ? { fallback: true as const } : {}) };
    }
  }

  if (suppression !== undefined) {
    if (!Array.isArray(suppression)) return fail("invalid suppression");
    for (const s of suppression) {
      if (!isRecord(s) || typeof s["id"] !== "string" || !isInt(s["v"]) || s["v"] < 1 || s["v"] > SUPPRESS_MAX) return fail("invalid suppression");
      const who = world.entities[s["id"]];
      if (!who || who.state === "down") return fail("suppression names a unit that is not alive in the state");
      if (Object.hasOwn(world.suppression, s["id"])) return fail("duplicate suppression");
      world.suppression[s["id"]] = s["v"];
    }
  }

  if (noticed !== undefined) {
    if (!Array.isArray(noticed)) return fail("invalid noticed evidence");
    const startDoors = buildWorld(map).doors;
    for (const n of noticed) {
      if (!isRecord(n) || typeof n["k"] !== "string" || !isInt(n["t"]) || n["t"] < 0 || n["t"] > tick) return fail("invalid noticed evidence");
      const at = n["k"].indexOf(">");
      const who = world.entities[n["k"].slice(0, at)];
      const what = n["k"].slice(at + 1);
      const doorNow = what.startsWith("door:") ? doors.find((d) => isRecord(d) && d["id"] === what.slice(5)) : undefined;
      const body = what.startsWith("body:") ? world.entities[what.slice(5)] : undefined;
      const ok =
        at > 0 && who?.side === "defender" && who.state !== "down" &&
        ((isRecord(doorNow) && Object.hasOwn(startDoors, what.slice(5)) && doorNow["state"] !== startDoors[what.slice(5)]) ||
          (body !== undefined && body.state === "down" && body.side !== "operator"));
      if (!ok) return fail("noticed evidence names something that is not evidence in the state");
      if (Object.hasOwn(world.noticed, n["k"])) return fail("duplicate noticed evidence");
      world.noticed[n["k"]] = n["t"];
    }
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
  const sight = createSightEnv(map);
  if (opts.mission) {
    const plan = planMission(map, opts.mission, rng);
    world.setup = plan.setup;
    for (const s of plan.spawns) {
      addEntity(world, { id: s.id, side: s.side, pos: { floor: s.floor, xCm: toCm(s.x), yCm: toCm(s.y) }, facing: 0, health: DEFAULT_HEALTH, state: "idle" });
    }
  }

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
      const ctx = createCtx(world.tick + 1, rng, opts.nav, sight);
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
      sight.reset();
    },
  };
}
