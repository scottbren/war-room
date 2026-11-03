import { describe, expect, it } from "vitest";
import { createSim } from "@war-room/sim";
import type { Command } from "@war-room/sim";
import { createRecorder, parseRecording, replay, stringifyRecording } from "../src/replay";
import { runScripted } from "../src/scripted";
import { makeSandboxMap } from "../src/sandboxMap";

describe("replay", () => {
  const map = makeSandboxMap();

  it("replays a 600-tick recording twice with identical per-tick hash lists", () => {
    const run = runScripted({ map, seed: 42, ticks: 600 });
    expect(run.recording.commands.length).toBeGreaterThan(10); // the script actually did something

    const first = replay(run.recording, map);
    const second = replay(run.recording, map);
    expect(first).toHaveLength(600);
    expect(second).toEqual(first);
    expect(first).toEqual(run.hashes); // and it matches the original live run
  });

  it("survives a trip through JSON text", () => {
    const run = runScripted({ map, seed: 7, ticks: 200 });
    const text = stringifyRecording(run.recording);
    expect(typeof text).toBe("string");
    const back = parseRecording(text);
    expect(back).toEqual(run.recording);
    expect(replay(back, map)).toEqual(run.hashes);
  });

  it("records seed, map id and version, tick count, and each command with the tick it was enqueued at", () => {
    const rec = createRecorder(createSim({ seed: 9, map }), { seed: 9, map });
    const a: Command = { kind: "setDoor", tick: 0, doorId: "d.front", state: "open" };
    const b: Command = { kind: "move", tick: 3, entity: "op.alpha.1", to: { floor: "ground", x: 5, y: 5 } };
    rec.enqueue(a);
    rec.step();
    rec.step();
    rec.enqueue(b); // enqueued after 2 ticks, for tick 3
    rec.step();
    rec.step();
    expect(rec.finish()).toEqual({
      version: 1,
      seed: 9,
      mapId: map.id,
      mapVersion: map.version,
      ticks: 4,
      commands: [
        { at: 0, command: a },
        { at: 2, command: b },
      ],
    });
  });

  it("replays commands at the tick they were enqueued, so queue contents (and hashes) match the live run", () => {
    const sim = createSim({ seed: 3, map });
    const rec = createRecorder(sim, { seed: 3, map });
    const live: string[] = [];
    rec.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 9, y: 9 } });
    for (let t = 0; t < 30; t++) {
      if (t === 10) rec.enqueue({ kind: "move", tick: 25, entity: "def.vet.1", to: { floor: "ground", x: 1, y: 1 } });
      rec.step();
      live.push(sim.hash());
    }
    expect(replay(rec.finish(), map)).toEqual(live);
  });

  it("does not record a command the sim refused to enqueue", () => {
    const rec = createRecorder(createSim({ seed: 1, map }), { seed: 1, map });
    expect(() => rec.enqueue({ kind: "move", tick: -1, entity: "op.alpha.1", to: { floor: "ground", x: 1, y: 1 } })).toThrow();
    expect(rec.finish().commands).toEqual([]);
  });

  it("refuses to replay against a different map version", () => {
    const run = runScripted({ map, seed: 1, ticks: 20 });
    expect(() => replay(run.recording, { ...map, version: map.version + 1 })).toThrow(/version/i);
    expect(() => replay(run.recording, { ...map, id: "other" })).toThrow(/map/i);
  });

  it("rejects malformed recordings", () => {
    expect(() => parseRecording("not json")).toThrow(/recording/i);
    expect(() => parseRecording("{}")).toThrow(/recording/i);
    expect(() => parseRecording(JSON.stringify({ version: 1, seed: 1, mapId: "x", mapVersion: 1, ticks: -3, commands: [] }))).toThrow(/recording/i);
    expect(() => parseRecording(JSON.stringify({ version: 1, seed: 1, mapId: "x", mapVersion: 1, ticks: 3, commands: "no" }))).toThrow(/recording/i);
    const bad = { version: 1, seed: 1, mapId: "x", mapVersion: 1, ticks: 3 };
    expect(() => parseRecording(JSON.stringify({ ...bad, commands: [{ at: -1, command: { kind: "move", tick: 0 } }] }))).toThrow(/recording/i);
    expect(() => parseRecording(JSON.stringify({ ...bad, commands: [{ at: 2, command: { kind: "move", tick: 0 } }, { at: 1, command: { kind: "move", tick: 0 } }] }))).toThrow(/recording/i);
    expect(() => parseRecording(JSON.stringify({ ...bad, commands: [{ at: 0 }] }))).toThrow(/recording/i);
  });

  it("a different seed gives a different run", () => {
    const a = runScripted({ map, seed: 1, ticks: 300 });
    const b = runScripted({ map, seed: 2, ticks: 300 });
    expect(a.finalHash).not.toBe(b.finalHash);
  });
});
