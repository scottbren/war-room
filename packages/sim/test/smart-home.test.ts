import { describe, expect, it } from "vitest";
import type { MapFile } from "@war-room/content";
import { createSim } from "../src";
import type { Sim, SimEvent, Snapshot } from "../src";
import { makeTestMap } from "./helpers/testMap";

/** The test map plus a window with a shutter, a slit without one, and one of each smart device. */
function smartMap(): MapFile {
  const map = makeTestMap();
  const floor = map.floors[0]!;
  floor.windows.push(
    { id: "win.a", at: { x: 10, y: 20 }, width: 1.8, between: ["g.a", "outside"], shutter: true, blastRated: true },
    { id: "win.b", at: { x: 15, y: 20 }, width: 1.8, between: ["g.a", "outside"], shutter: true, blastRated: true },
    { id: "win.slit", at: { x: 18, y: 20 }, width: 0.4, between: ["g.a", "outside"], shutter: false, blastRated: true },
  );
  const smart = (id: string, kind: string, x: number, extra: string[] = []) => ({ id, floor: "ground" as const, kind: "poi" as const, at: { x, y: 10 }, tags: [`smart:${kind}`, ...extra] });
  map.markers.push(
    smart("m.hub", "hub", 1, ["hub:primary", "in:g.a"]),
    smart("m.hub.backup", "hub", 2, ["hub:backup"]),
    smart("m.cam", "camera", 3, ["feeds:g.a", "covers:room"]),
    smart("m.motion", "motion", 4, ["feeds:g.a"]),
    smart("m.flood", "floodlight", 5, ["feeds:g.a"]),
    smart("m.lock", "lock", 6, ["door:d.front"]),
  );
  return map;
}

const newSim = (map = smartMap(), seed = 1): Sim => createSim({ seed, map });
const dev = (snap: Snapshot, id: string) => snap.devices.find((d) => d.id === id)!;
const run = (sim: Sim, ticks: number) => {
  const out: { snapshot: Snapshot; events: SimEvent[] }[] = [];
  for (let i = 0; i < ticks; i++) out.push(sim.step());
  return out;
};
const last = (sim: Sim, ticks = 1) => run(sim, ticks).at(-1)!;

describe("smart home: initial state", () => {
  it("builds one device per smart marker (sorted by id), all on except floodlights", () => {
    const { snapshot } = newSim().step();
    expect(snapshot.devices).toEqual([
      { id: "m.cam", kind: "camera", state: "on" },
      { id: "m.flood", kind: "floodlight", state: "off" },
      { id: "m.hub", kind: "hub", state: "on" },
      { id: "m.hub.backup", kind: "hub", state: "on" },
      { id: "m.lock", kind: "lock", state: "on" },
      { id: "m.motion", kind: "motion", state: "on" },
    ]);
    expect(snapshot.hubOnline).toBe(true);
    expect(snapshot.alert).toBe(0);
  });

  it("lists shutters only for windows that have one, all open", () => {
    expect(newSim().step().snapshot.shutters).toEqual([
      { id: "win.a", state: "open" },
      { id: "win.b", state: "open" },
    ]);
  });

  it("refuses a lock marker that names a door that does not exist", () => {
    const map = smartMap();
    map.markers.find((m) => m.id === "m.lock")!.tags = ["smart:lock", "door:d.nowhere"];
    expect(() => newSim(map)).toThrow(/d\.nowhere/);
  });

  it("ignores markers with no smart tag, and refuses an unknown smart kind", () => {
    expect(newSim().step().snapshot.devices.some((d) => d.id === "m.poi")).toBe(false);
    const map = smartMap();
    map.markers.push({ id: "m.bad", floor: "ground", kind: "poi", at: { x: 1, y: 1 }, tags: ["smart:toaster"] });
    expect(() => newSim(map)).toThrow(/toaster/);
  });
});

describe("smart home: commands", () => {
  it("setDevice turns a device off and on, with a device event", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.cam", state: "off" });
    const { snapshot, events } = last(sim);
    expect(dev(snapshot, "m.cam").state).toBe("off");
    expect(events).toContainEqual(expect.objectContaining({ type: "device", deviceId: "m.cam", state: "off" }));
  });

  it("only cameras can be looped", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.cam", state: "looped" });
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.motion", state: "looped" });
    const { snapshot, events } = last(sim);
    expect(dev(snapshot, "m.cam").state).toBe("looped");
    expect(dev(snapshot, "m.motion").state).toBe("on");
    expect(events).toContainEqual(expect.objectContaining({ type: "commandRejected", command: "setDevice" }));
  });

  it("rejects unknown devices, shutters and out-of-range alert levels", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.ghost", state: "off" });
    sim.enqueue({ kind: "setShutter", tick: 0, windowId: "win.slit", state: "closed" }); // no shutter
    sim.enqueue({ kind: "setAlert", tick: 0, level: 7 as never });
    const { events } = last(sim);
    expect(events.filter((e) => e.type === "commandRejected")).toHaveLength(3);
  });

  it("setShutter closes and reopens one shutter, with an event", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setShutter", tick: 0, windowId: "win.a", state: "closed" });
    const { snapshot, events } = last(sim);
    expect(snapshot.shutters).toEqual([
      { id: "win.a", state: "closed" },
      { id: "win.b", state: "open" },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: "shutter", windowId: "win.a", state: "closed" }));
  });

  it("hubOnline is true while any hub is on, false when both are off", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.hub", state: "off" });
    expect(last(sim).snapshot.hubOnline).toBe(true); // the backup hub still runs the house
    sim.enqueue({ kind: "setDevice", tick: 1, deviceId: "m.hub.backup", state: "off" });
    expect(last(sim).snapshot.hubOnline).toBe(false);
  });
});

describe("smart home: alert automation (needs a hub)", () => {
  const raise = (sim: Sim, level: 0 | 1 | 2 | 3, tick: number) => sim.enqueue({ kind: "setAlert", tick, level });

  it("level 1 switches the floodlights on", () => {
    const sim = newSim();
    raise(sim, 1, 0);
    const { snapshot, events } = last(sim);
    expect(snapshot.alert).toBe(1);
    expect(dev(snapshot, "m.flood").state).toBe("on");
    expect(snapshot.shutters.every((s) => s.state === "open")).toBe(true);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["alert", "device"]));
  });

  it("level 2 also drops every shutter", () => {
    const sim = newSim();
    raise(sim, 2, 0);
    const { snapshot } = last(sim);
    expect(dev(snapshot, "m.flood").state).toBe("on");
    expect(snapshot.shutters.every((s) => s.state === "closed")).toBe(true);
    expect(snapshot.doors.find((d) => d.id === "d.front")!.state).toBe("closed");
  });

  it("level 3 (lockdown) locks the doors that have a working lock", () => {
    const sim = newSim();
    raise(sim, 3, 0);
    const { snapshot, events } = last(sim);
    expect(snapshot.doors.find((d) => d.id === "d.front")!.state).toBe("locked");
    expect(events).toContainEqual(expect.objectContaining({ type: "door", doorId: "d.front", state: "locked" }));
  });

  it("a hacked (off) lock does not engage at lockdown", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.lock", state: "off" });
    raise(sim, 3, 0);
    expect(last(sim).snapshot.doors.find((d) => d.id === "d.front")!.state).toBe("closed");
  });

  it("with both hubs down the house is blind: raising the alert changes nothing else", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.hub", state: "off" });
    sim.enqueue({ kind: "setDevice", tick: 0, deviceId: "m.hub.backup", state: "off" });
    raise(sim, 3, 1);
    const { snapshot } = last(sim, 2);
    expect(snapshot.alert).toBe(3);
    expect(dev(snapshot, "m.flood").state).toBe("off");
    expect(snapshot.shutters.every((s) => s.state === "open")).toBe(true);
    expect(snapshot.doors.find((d) => d.id === "d.front")!.state).toBe("closed");
  });

  it("each level fires once: a manual override after the alert is not undone next tick", () => {
    const sim = newSim();
    raise(sim, 2, 0);
    run(sim, 1);
    sim.enqueue({ kind: "setShutter", tick: 1, windowId: "win.a", state: "open" });
    sim.enqueue({ kind: "setDevice", tick: 1, deviceId: "m.flood", state: "off" });
    const { snapshot } = last(sim, 3);
    expect(snapshot.shutters.find((s) => s.id === "win.a")!.state).toBe("open");
    expect(dev(snapshot, "m.flood").state).toBe("off");
  });

  it("jumping straight to level 3 applies the lower levels too, and stand-down does not undo anything", () => {
    const sim = newSim();
    raise(sim, 3, 0);
    raise(sim, 0, 1);
    const { snapshot } = last(sim, 2);
    expect(snapshot.alert).toBe(0);
    expect(dev(snapshot, "m.flood").state).toBe("on");
    expect(snapshot.shutters.every((s) => s.state === "closed")).toBe(true);
  });
});

describe("smart home: determinism and save/restore", () => {
  const script = (sim: Sim) => {
    sim.enqueue({ kind: "setDevice", tick: 2, deviceId: "m.cam", state: "looped" });
    sim.enqueue({ kind: "setAlert", tick: 3, level: 2 });
    sim.enqueue({ kind: "setShutter", tick: 5, windowId: "win.b", state: "open" });
  };

  it("two sims with the same inputs have the same hash", () => {
    const a = newSim(), b = newSim();
    script(a);
    script(b);
    run(a, 8);
    run(b, 8);
    expect(a.hash()).toBe(b.hash());
  });

  it("smart state is part of the hash", () => {
    const a = newSim(), b = newSim();
    a.enqueue({ kind: "setAlert", tick: 1, level: 1 });
    run(a, 3);
    run(b, 3);
    expect(a.hash()).not.toBe(b.hash());
  });

  it("serialize then restore resumes identically, including pending smart commands", () => {
    const a = newSim();
    script(a);
    run(a, 4);
    const saved = a.serialize();
    const b = newSim();
    b.restore(saved);
    expect(b.hash()).toBe(a.hash());
    expect(run(b, 6).map((s) => s.snapshot)).toEqual(run(a, 6).map((s) => s.snapshot));
    expect(b.hash()).toBe(a.hash());
  });

  it("restore rejects a corrupt device, shutter or alert, and leaves the sim untouched", () => {
    const a = newSim();
    run(a, 2);
    const state = JSON.parse(a.serialize()) as { devices: { id: string; state: string }[]; shutters: { id: string; state: string }[]; alert: number };
    const before = a.hash();
    const bad = (mutate: (s: typeof state) => void) => {
      const copy = structuredClone(state);
      mutate(copy);
      expect(() => a.restore(JSON.stringify(copy))).toThrow(/restore/);
      expect(a.hash()).toBe(before);
    };
    bad((s) => { s.devices[0]!.state = "melted"; });
    bad((s) => { s.devices.pop(); });
    bad((s) => { s.shutters[0]!.state = "ajar"; });
    bad((s) => { s.alert = 9; });
    bad((s) => { s.alert = 1; (s as unknown as { alertApplied: number }).alertApplied = 2; });
  });
});
