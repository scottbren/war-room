import { describe, expect, it } from "vitest";
import type { Snapshot } from "@war-room/sim";
import { SimBridge, interpolateSnapshots } from "../src/bridge";
import type { FromWorker, ToWorker } from "../src/protocol";

const snap = (tick: number, ...units: { id: string; floor?: "ground" | "upper"; x: number; y: number; facing?: number }[]): Snapshot => ({
  tick,
  entities: units.map((u) => ({ id: u.id, side: "operator", pos: { floor: u.floor ?? "ground", x: u.x, y: u.y }, facing: u.facing ?? 0, health: 100, state: "moving" })),
  doors: [],
  devices: [],
  shutters: [],
  alert: 0,
  hubOnline: true,
});

describe("interpolateSnapshots", () => {
  it("blends positions between two snapshots", () => {
    const units = interpolateSnapshots(snap(1, { id: "a", x: 0, y: 0 }), snap(2, { id: "a", x: 10, y: 20 }), 0.25);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ id: "a", floor: "ground", x: 2.5, y: 5 });
  });

  it("clamps alpha to the range 0 to 1", () => {
    const prev = snap(1, { id: "a", x: 0, y: 0 }), next = snap(2, { id: "a", x: 10, y: 0 });
    expect(interpolateSnapshots(prev, next, -3)[0]!.x).toBe(0);
    expect(interpolateSnapshots(prev, next, 5)[0]!.x).toBe(10);
  });

  it("uses the newest snapshot when there is no earlier one, or the unit is new, or it changed floor", () => {
    expect(interpolateSnapshots(undefined, snap(2, { id: "a", x: 7, y: 7 }), 0.5)[0]).toMatchObject({ x: 7, y: 7 });
    expect(interpolateSnapshots(snap(1, { id: "b", x: 0, y: 0 }), snap(2, { id: "a", x: 7, y: 7 }), 0.5)[0]).toMatchObject({ x: 7, y: 7 });
    const crossed = interpolateSnapshots(snap(1, { id: "a", x: 0, y: 0 }), snap(2, { id: "a", floor: "upper", x: 10, y: 0 }), 0.5)[0]!;
    expect(crossed).toMatchObject({ floor: "upper", x: 10 });
  });

  it("turns the short way round through north: 350 degrees to 10 is a 20 degree turn", () => {
    const f = interpolateSnapshots(snap(1, { id: "a", x: 0, y: 0, facing: 350 }), snap(2, { id: "a", x: 0, y: 0, facing: 10 }), 0.5)[0]!.facing;
    expect(f === 0 || f === 360).toBe(true);
    const g = interpolateSnapshots(snap(1, { id: "a", x: 0, y: 0, facing: 10 }), snap(2, { id: "a", x: 0, y: 0, facing: 350 }), 0.25)[0]!.facing;
    expect(g).toBeCloseTo(5, 5);
  });

  it("keeps the order of the newest snapshot (sorted by id)", () => {
    const units = interpolateSnapshots(snap(1, { id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }), snap(2, { id: "a", x: 1, y: 0 }, { id: "b", x: 2, y: 0 }), 0.5);
    expect(units.map((u) => u.id)).toEqual(["a", "b"]);
  });
});

/** A worker stand-in that records what the bridge posts and lets a test push messages back. */
function fakeWorker() {
  const posted: ToWorker[] = [];
  const worker = {
    posted,
    onmessage: null as ((e: { data: FromWorker }) => void) | null,
    postMessage(m: ToWorker) {
      posted.push(m);
    },
    terminate() {},
    send(m: FromWorker) {
      worker.onmessage?.({ data: m });
    },
  };
  return worker;
}

describe("SimBridge", () => {
  it("asks the worker to start, and reports ready once the first snapshot arrives", () => {
    const w = fakeWorker();
    const now = 0;
    const bridge = new SimBridge(w, () => now);
    bridge.start(42);
    expect(w.posted).toEqual([{ type: "init", seed: 42 }]);
    expect(bridge.ready).toBe(false);
    w.send({ type: "ready", snapshot: snap(0, { id: "a", x: 0, y: 0 }) });
    expect(bridge.ready).toBe(true);
    expect(bridge.units(now)).toHaveLength(1);
  });

  it("interpolates from the previous snapshot toward the latest over one 100 ms tick, then holds", () => {
    const w = fakeWorker();
    let now = 1000;
    const bridge = new SimBridge(w, () => now);
    bridge.start(1);
    w.send({ type: "ready", snapshot: snap(0, { id: "a", x: 0, y: 0 }) });
    now = 1100;
    w.send({ type: "tick", snapshot: snap(1, { id: "a", x: 10, y: 0 }), events: [] });
    expect(bridge.units(1100)[0]!.x).toBe(0); // just arrived: still at the old position
    expect(bridge.units(1150)[0]!.x).toBeCloseTo(5, 5);
    expect(bridge.units(1200)[0]!.x).toBe(10);
    expect(bridge.units(1900)[0]!.x).toBe(10); // no later snapshot: stays put, does not overshoot
    expect(bridge.tick).toBe(1);
  });

  it("collects events for the caller and forwards move requests and errors", () => {
    const w = fakeWorker();
    const bridge = new SimBridge(w, () => 0);
    const seen: string[] = [];
    bridge.onEvents = (events) => seen.push(...events.map((e) => e.type));
    bridge.onError = (m) => seen.push(`error:${m}`);
    bridge.start(1);
    w.send({ type: "ready", snapshot: snap(0, { id: "a", x: 0, y: 0 }) });
    w.send({ type: "tick", snapshot: snap(1, { id: "a", x: 1, y: 0 }), events: [{ id: "1.0", tick: 1, v: 1, type: "arrived", entity: "a" }] });
    w.send({ type: "error", message: "boom" });
    expect(seen).toEqual(["arrived", "error:boom"]);
    bridge.moveTo("a", [{ floor: "ground", x: 3, y: 4 }]);
    expect(w.posted.at(-1)).toEqual({ type: "moveTo", entity: "a", candidates: [{ floor: "ground", x: 3, y: 4 }] });
  });
});
