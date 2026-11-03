import { createSim } from "@war-room/sim";
import type { Command, Sim } from "@war-room/sim";
import type { MapFile } from "@war-room/content";

/**
 * A raid is fully described by its seed, map version and command log.
 * Each command carries `at`: the number of ticks already completed when it was
 * enqueued. Replay must enqueue at the same moments, because the pending queue
 * is part of the state hash.
 */
export interface Recording {
  version: 1;
  seed: number;
  mapId: string;
  mapVersion: number;
  /** Number of ticks the run lasted. */
  ticks: number;
  commands: { at: number; command: Command }[];
}

export interface Recorder {
  /** Enqueues on the sim and records it. A command the sim refuses is not recorded. */
  enqueue(command: Command): void;
  /** Steps the sim one tick (the recorder counts ticks). */
  step(): ReturnType<Sim["step"]>;
  finish(): Recording;
}

export function createRecorder(sim: Sim, meta: { seed: number; map: MapFile }): Recorder {
  const commands: Recording["commands"] = [];
  let ticks = 0;
  return {
    enqueue(command) {
      sim.enqueue(command); // throws first if invalid, so nothing bad is recorded
      commands.push({ at: ticks, command: structuredClone(command) });
    },
    step() {
      const result = sim.step();
      ticks += 1;
      return result;
    },
    finish: () => ({
      version: 1,
      seed: meta.seed,
      mapId: meta.map.id,
      mapVersion: meta.map.version,
      ticks,
      commands: structuredClone(commands),
    }),
  };
}

/** Replays a recording and returns the state hash after every tick. */
export function replay(recording: Recording, map: MapFile): string[] {
  if (recording.mapId !== map.id) {
    throw new Error(`replay: recording is for map "${recording.mapId}", got "${map.id}"`);
  }
  if (recording.mapVersion !== map.version) {
    throw new Error(`replay: recording is for map version ${recording.mapVersion}, got version ${map.version}`);
  }

  const sim = createSim({ seed: recording.seed, map });
  const hashes: string[] = [];
  let next = 0;
  for (let t = 0; t < recording.ticks; t++) {
    while (next < recording.commands.length && (recording.commands[next] as Recording["commands"][number]).at === t) {
      sim.enqueue((recording.commands[next] as Recording["commands"][number]).command);
      next++;
    }
    sim.step();
    hashes.push(sim.hash());
  }
  return hashes;
}

export function stringifyRecording(recording: Recording): string {
  return JSON.stringify(recording, null, 2);
}

const bad = (why: string): never => {
  throw new Error(`Invalid recording: ${why}`);
};

export function parseRecording(text: string): Recording {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad("not valid JSON");
  }
  if (typeof raw !== "object" || raw === null) return bad("not an object");
  const r = raw as Record<string, unknown>;
  if (r["version"] !== 1) return bad("unsupported version");
  if (!Number.isInteger(r["seed"])) return bad("seed must be an integer");
  if (typeof r["mapId"] !== "string") return bad("mapId must be a string");
  if (!Number.isInteger(r["mapVersion"])) return bad("mapVersion must be an integer");
  const ticks = r["ticks"];
  if (typeof ticks !== "number" || !Number.isInteger(ticks) || ticks < 0) return bad("ticks must be a non-negative integer");
  if (!Array.isArray(r["commands"])) return bad("commands must be an array");

  let previous = 0;
  for (const entry of r["commands"] as unknown[]) {
    const e = entry as Record<string, unknown> | null;
    const at = e?.["at"];
    if (typeof at !== "number" || !Number.isInteger(at) || at < 0) return bad("each command needs a non-negative integer 'at'");
    if (at < previous) return bad("commands must be ordered by 'at'");
    previous = at;
    const command = e?.["command"] as Record<string, unknown> | undefined;
    if (typeof command !== "object" || command === null || typeof command["kind"] !== "string") {
      return bad("each command needs a 'command' object with a kind");
    }
  }
  return r as unknown as Recording;
}
