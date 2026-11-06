import { describe, expect, it } from "vitest";
import { createSim } from "../src";
import type { Command, Sim, SimEvent, Snapshot } from "../src";
import { makeTestMap } from "./helpers/testMap";

const OP = "op.alpha.1";
const DEF = "def.vet.1";
const at = (x: number, y: number) => ({ floor: "ground" as const, x, y });

function newSim(seed = 1): Sim {
  return createSim({ seed, map: makeTestMap() });
}

function entity(snap: Snapshot, id: string) {
  const e = snap.entities.find((x) => x.id === id);
  if (!e) throw new Error(`no entity ${id}`);
  return e;
}

function run(sim: Sim, ticks: number) {
  const out: { snapshot: Snapshot; events: SimEvent[] }[] = [];
  for (let i = 0; i < ticks; i++) out.push(sim.step());
  return out;
}

describe("spawning", () => {
  it("spawns one entity per spawn marker, sorted by id, idle, at the marker", () => {
    const { snapshot } = newSim().step();
    expect(snapshot.entities.map((e) => e.id)).toEqual([DEF, OP]); // not file order
    expect(entity(snapshot, OP)).toMatchObject({ side: "operator", pos: at(0, 0), state: "idle", health: 100 });
    expect(entity(snapshot, DEF)).toMatchObject({ side: "defender", pos: at(10, 0), state: "idle" });
  });

  it("lists doors from the map in the snapshot, sorted by id", () => {
    expect(newSim().step().snapshot.doors).toEqual([
      { id: "d.back", state: "locked" },
      { id: "d.front", state: "closed" },
    ]);
  });

  it("throws when a spawn marker has no entity or side tag", () => {
    const map = makeTestMap();
    map.markers.push({ id: "m.bad", floor: "ground", kind: "spawn", at: { x: 1, y: 1 }, tags: [] });
    expect(() => createSim({ seed: 1, map })).toThrow(/m\.bad/);
  });
});

describe("ticks and snapshots", () => {
  it("advances exactly one tick per step, snapshot.tick counts completed ticks", () => {
    const sim = newSim();
    expect(run(sim, 3).map((r) => r.snapshot.tick)).toEqual([1, 2, 3]);
  });

  it("returns snapshots the caller can mutate without touching the sim", () => {
    const sim = newSim();
    const first = sim.step();
    const before = sim.hash();
    entity(first.snapshot, OP).pos.x = 999;
    first.snapshot.entities.length = 0;
    expect(sim.hash()).toBe(before);
    expect(sim.step().snapshot.entities).toHaveLength(2);
  });
});

describe("move command", () => {
  it("moves along a straight line at unit speed, emits moved each tick and arrived once", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(1, 0) });
    const steps = run(sim, 7);

    // operator speed is 20 cm per tick: 0.2, 0.4, 0.6, 0.8, 1.0 then it stops.
    const xs = steps.map((s) => entity(s.snapshot, OP).pos.x);
    expect(xs).toEqual([0.2, 0.4, 0.6, 0.8, 1, 1, 1]);
    expect(steps.map((s) => entity(s.snapshot, OP).state)).toEqual([
      "moving", "moving", "moving", "moving", "idle", "idle", "idle",
    ]);
    expect(entity(steps[0]!.snapshot, OP).facing).toBe(90); // east

    const moved = steps.flatMap((s) => s.events).filter((e) => e.type === "moved");
    expect(moved.map((e) => e.tick)).toEqual([1, 2, 3, 4, 5]);
    expect(moved[0]).toMatchObject({ entity: OP, to: at(0.2, 0), v: 1 });
    expect(moved[4]).toMatchObject({ entity: OP, to: at(1, 0) });

    const arrived = steps.flatMap((s) => s.events).filter((e) => e.type === "arrived");
    expect(arrived).toHaveLength(1);
    expect(arrived[0]).toMatchObject({ entity: OP, tick: 5 });
  });

  it("moves diagonally using integer math and faces the target", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(3, 4) }); // 5 m away
    const steps = run(sim, 26);
    const first = entity(steps[0]!.snapshot, OP);
    expect(first.pos).toEqual(at(0.12, 0.16)); // 20 cm along a 3-4-5 triangle
    expect(first.facing).toBe(37);
    expect(entity(steps[23]!.snapshot, OP).state).toBe("moving");
    expect(entity(steps[24]!.snapshot, OP)).toMatchObject({ pos: at(3, 4), state: "idle" });
    expect(steps.flatMap((s) => s.events).filter((e) => e.type === "arrived")).toHaveLength(1);
  });

  it("does not overshoot when the target is closer than one step", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(0.05, 0) });
    const s = sim.step();
    expect(entity(s.snapshot, OP)).toMatchObject({ pos: at(0.05, 0), state: "idle" });
    expect(s.events.map((e) => e.type)).toEqual(["moved", "arrived"]);
  });

  it("only applies a command on its own tick", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 3, entity: OP, to: at(5, 0) });
    const steps = run(sim, 5);
    expect(steps.map((s) => entity(s.snapshot, OP).pos.x)).toEqual([0, 0, 0, 0.2, 0.4]);
  });

  it("applies commands that share a tick in enqueue order (last one wins)", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(0, 5) });
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(5, 0) });
    expect(entity(sim.step().snapshot, OP).pos).toEqual(at(0.2, 0));
  });

  it("moves several entities in one tick, events in sorted entity order", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(5, 0) });
    sim.enqueue({ kind: "move", tick: 0, entity: DEF, to: at(15, 0) });
    const { events, snapshot } = sim.step();
    expect(events.filter((e) => e.type === "moved").map((e) => (e as { entity: string }).entity)).toEqual([DEF, OP]);
    expect(entity(snapshot, DEF).pos.x).toBe(10.15); // defender speed is 15 cm per tick
  });

  it("gives events ids of the form <tick>.<index> that are unique and ordered", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(0.1, 0) });
    sim.enqueue({ kind: "move", tick: 0, entity: DEF, to: at(10.1, 0) });
    const { events } = sim.step();
    expect(events.map((e) => e.id)).toEqual(["1.0", "1.1", "1.2", "1.3"]);
  });
});

describe("rejected commands", () => {
  const rejected = (events: SimEvent[]) => events.filter((e) => e.type === "commandRejected");

  it("rejects a command for a tick that has already passed, with an event", () => {
    const sim = newSim();
    run(sim, 3);
    sim.enqueue({ kind: "move", tick: 1, entity: OP, to: at(5, 0) });
    const { events, snapshot } = sim.step();
    expect(rejected(events)).toHaveLength(1);
    expect(rejected(events)[0]).toMatchObject({ command: "move", tick: 4 });
    expect(entity(snapshot, OP).pos).toEqual(at(0, 0)); // nothing happened
  });

  it("rejects a move for an unknown entity", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: "op.ghost", to: at(1, 1) });
    expect(rejected(sim.step().events)[0]).toMatchObject({ reason: expect.stringMatching(/unknown entity/i) });
  });

  it("rejects a move to a different floor until the navmesh exists", () => {
    const sim = newSim();
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: { floor: "upper", x: 1, y: 1 } });
    const { events, snapshot } = sim.step();
    expect(rejected(events)[0]).toMatchObject({ reason: expect.stringMatching(/floor/i) });
    expect(entity(snapshot, OP).state).toBe("idle");
  });

  it("rejects week-2 commands instead of silently ignoring them", () => {
    const sim = newSim();
    const cmds: Command[] = [
      { kind: "issuePlan", tick: 0, plan: { id: "p", issuedBy: "x", intent: "y", tasks: [] } },
      { kind: "decide", tick: 0, cardId: "c", optionId: "o" },
      { kind: "intervene", tick: 0, action: "hold" },
    ];
    cmds.forEach((c) => sim.enqueue(c));
    expect(rejected(sim.step().events).map((e) => (e as { command: string }).command)).toEqual([
      "issuePlan", "decide", "intervene",
    ]);
  });
});

describe("setDoor command", () => {
  it("changes the door, emits a door event, and shows in the snapshot", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDoor", tick: 0, doorId: "d.front", state: "open" });
    const { events, snapshot } = sim.step();
    // Listeners in range also get a `noise` event for the door; this test is about the door event itself.
    expect(events.filter((e) => e.type !== "noise")).toEqual([{ id: "1.0", tick: 1, type: "door", doorId: "d.front", state: "open", v: 1 }]);
    expect(snapshot.doors).toContainEqual({ id: "d.front", state: "open" });
  });

  it("rejects an unknown door", () => {
    const sim = newSim();
    sim.enqueue({ kind: "setDoor", tick: 0, doorId: "d.nope", state: "open" });
    expect(sim.step().events[0]).toMatchObject({ type: "commandRejected", command: "setDoor" });
  });
});

describe("determinism", () => {
  function scripted(seed: number): string[] {
    const sim = newSim(seed);
    sim.enqueue({ kind: "move", tick: 2, entity: OP, to: at(3, 4) });
    sim.enqueue({ kind: "move", tick: 4, entity: DEF, to: at(2, 9) });
    sim.enqueue({ kind: "setDoor", tick: 6, doorId: "d.back", state: "open" });
    const hashes: string[] = [];
    for (let i = 0; i < 40; i++) {
      sim.step();
      hashes.push(sim.hash());
    }
    return hashes;
  }

  it("gives the same per-tick hash list for the same seed and commands", () => {
    expect(scripted(7)).toEqual(scripted(7));
  });

  it("changes the hash as the state changes", () => {
    const hashes = scripted(7);
    expect(new Set(hashes.slice(0, 10)).size).toBeGreaterThan(5);
  });

  it("hashes differently for different seeds (rng state is part of the hash)", () => {
    expect(newSim(1).hash()).not.toBe(newSim(2).hash());
  });

  it("has a stable final hash (regression pin)", () => {
    const hashes = scripted(7);
    expect(hashes[hashes.length - 1]).toMatch(/^[0-9a-f]{8}$/);
    // Re-pinned when perception arrived: the operator and the defender in this scenario can see each other, so the
    // state now carries their sight memory. (See packages/tools/test/perception.test.ts for that behaviour.)
    // Re-pinned again when hearing arrived: heard sounds draw their position error from the seeded PRNG, so the
    // generator state in the hash moves. (See packages/tools/test/hearing.test.ts.)
    // Re-pinned a third time when defenders got minds: the defender here sees the operator, so it is now alerted and
    // the state carries its mind. (See packages/tools/test/defender.test.ts.)
    // And a fourth time when defenders got a field of view: this one faces north by default, so it no longer sees the
    // operator who is behind it. (See packages/tools/test/fov.test.ts.)
    expect(hashes[hashes.length - 1]).toBe("2591c2f8");
  });
});

describe("serialize / restore", () => {
  it("restores mid-run into a new sim and matches the original for all remaining ticks", () => {
    const original = newSim(5);
    original.enqueue({ kind: "move", tick: 1, entity: OP, to: at(3, 4) });
    original.enqueue({ kind: "move", tick: 12, entity: DEF, to: at(2, 9) }); // still queued at snapshot time
    run(original, 8);
    const saved = original.serialize();
    const hashAtSave = original.hash();

    const copy = newSim(5);
    copy.restore(saved);
    expect(copy.hash()).toBe(hashAtSave);

    for (let i = 0; i < 40; i++) {
      const a = original.step();
      const b = copy.step();
      expect(b.snapshot).toEqual(a.snapshot);
      expect(b.events).toEqual(a.events);
      expect(copy.hash()).toBe(original.hash());
    }
  });

  it("restoring over a sim with a different history replaces it entirely", () => {
    const a = newSim(5);
    run(a, 6);
    const saved = a.serialize();
    const b = newSim(9);
    b.enqueue({ kind: "move", tick: 0, entity: DEF, to: at(1, 1) });
    run(b, 20);
    b.restore(saved);
    expect(b.hash()).toBe(a.hash());
  });

  it("serialize output is a stable string and restore rejects garbage", () => {
    const sim = newSim();
    run(sim, 2);
    expect(typeof sim.serialize()).toBe("string");
    expect(sim.serialize()).toBe(sim.serialize());
    expect(() => sim.restore("not json")).toThrow();
    expect(() => sim.restore("{}")).toThrow();
  });
});

describe("restore validation", () => {
  type Obj = Record<string, unknown>;
  interface Raw {
    seq: number;
    entities: Obj[];
    doors: Obj[];
    queue: { seq: number; command: Obj }[];
  }

  function saved(): { sim: Sim; raw: Raw } {
    const sim = newSim(5);
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(3, 4) });
    sim.enqueue({ kind: "move", tick: 20, entity: DEF, to: at(2, 9) });
    run(sim, 3);
    return { sim, raw: JSON.parse(sim.serialize()) as Raw };
  }
  const e = (r: Raw, i: number): Obj => r.entities[i] as Obj;
  const q = (r: Raw) => r.queue[0] as Raw["queue"][number];

  const cases: [string, (r: Raw) => void][] = [
    ["an entity without pos", (r) => delete e(r, 0)["pos"]],
    ["a non-integer position", (r) => ((e(r, 0)["pos"] as Obj)["xCm"] = 1.5)],
    ["an unknown side", (r) => (e(r, 0)["side"] = "alien")],
    ["an unknown entity state", (r) => (e(r, 0)["state"] = "dancing")],
    ["a facing outside 0-359", (r) => (e(r, 0)["facing"] = 400)],
    ["malformed motion", (r) => (e(r, 1)["motion"] = { toXCm: "far" })],
    ["a duplicate entity id", (r) => (e(r, 1)["id"] = e(r, 0)["id"])],
    ["a door that is not on the map", (r) => ((r.doors[0] as Obj)["id"] = "d.ghost")],
    ["a missing door", (r) => void r.doors.pop()],
    ["an invalid door state", (r) => ((r.doors[0] as Obj)["state"] = "ajar")],
    ["a queue seq at or above the next seq", (r) => (q(r).seq = r.seq)],
    ["duplicate queue seqs", (r) => void r.queue.push({ ...q(r) })],
    ["a queued command without a kind", (r) => delete q(r).command["kind"]],
  ];

  it.each(cases)("rejects %s and leaves the sim untouched", (_name, mutate) => {
    const { sim, raw } = saved();
    mutate(raw);
    const target = newSim(5);
    run(target, 2);
    const before = target.hash();
    expect(() => target.restore(JSON.stringify(raw))).toThrow(/restore/i);
    expect(target.hash()).toBe(before);
    // the untouched, valid state still restores fine
    target.restore(sim.serialize());
    expect(target.hash()).toBe(sim.hash());
  });
});

describe("unusual ids", () => {
  it("spawns an entity called __proto__ as an ordinary entity", () => {
    const map = makeTestMap();
    map.markers.push({ id: "m.p", floor: "ground", kind: "spawn", at: { x: 2, y: 2 }, tags: ["entity:__proto__", "side:civilian"] });
    const sim = createSim({ seed: 1, map });
    const ids = sim.step().snapshot.entities.map((e) => e.id);
    expect(ids).toContain("__proto__");
    expect(ids).toHaveLength(3);
    expect(({} as Record<string, unknown>)["facing"]).toBeUndefined(); // prototype not polluted
  });
});

describe("enqueue validation", () => {
  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])("throws on tick %s", (tick) => {
    const sim = newSim();
    expect(() => sim.enqueue({ kind: "move", tick, entity: OP, to: at(1, 1) })).toThrow(/tick/i);
  });
});

describe("restore validation, deeper", () => {
  type Obj = Record<string, unknown>;
  const tamper = (mutate: (raw: { entities: Obj[]; queue: { command: Obj }[] }) => void) => {
    const sim = newSim(5);
    sim.enqueue({ kind: "move", tick: 0, entity: OP, to: at(3, 4) });
    sim.enqueue({ kind: "move", tick: 20, entity: DEF, to: at(2, 9) });
    run(sim, 3);
    const raw = JSON.parse(sim.serialize()) as { entities: Obj[]; queue: { command: Obj }[] };
    mutate(raw);
    return () => newSim(5).restore(JSON.stringify(raw));
  };
  const cmd = (r: { queue: { command: Obj }[] }) => (r.queue[0] as { command: Obj }).command;

  it("rejects a queued command with an unknown kind", () => {
    expect(tamper((r) => (cmd(r)["kind"] = "selfDestruct"))).toThrow(/restore/i);
  });
  it("rejects a queued move with a missing or off-grid target", () => {
    expect(tamper((r) => delete cmd(r)["to"])).toThrow(/restore/i);
    expect(tamper((r) => (cmd(r)["to"] = { floor: "ground", x: 1.234, y: 0 }))).toThrow(/restore/i);
    expect(tamper((r) => (cmd(r)["to"] = { floor: "basement", x: 1, y: 0 }))).toThrow(/restore/i);
  });
  it("rejects a queued move without an entity", () => {
    expect(tamper((r) => delete cmd(r)["entity"])).toThrow(/restore/i);
  });
  it("rejects a queued setDoor with a bad state or an unknown door", () => {
    const door = (r: { queue: { command: Obj }[] }, patch: Obj) => {
      (r.queue[0] as { command: Obj }).command = { kind: "setDoor", tick: 20, doorId: "d.front", state: "open", ...patch };
    };
    expect(tamper((r) => door(r, { state: "ajar" }))).toThrow(/restore/i);
    expect(tamper((r) => door(r, { doorId: "d.ghost" }))).toThrow(/restore/i);
    expect(tamper((r) => door(r, {}))).not.toThrow(); // control: the valid form restores
  });
  it("rejects motion with a non-positive speed and negative health", () => {
    expect(tamper((r) => ((r.entities[1] as Obj)["motion"] = { toXCm: 1, toYCm: 1, speedCmPerTick: 0 }))).toThrow(/restore/i);
    expect(tamper((r) => ((r.entities[1] as Obj)["motion"] = { toXCm: 1, toYCm: 1, speedCmPerTick: -5 }))).toThrow(/restore/i);
    expect(tamper((r) => ((r.entities[0] as Obj)["health"] = -1))).toThrow(/restore/i);
  });
});
