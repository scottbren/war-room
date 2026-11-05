import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createKnowledge, createSim } from "@war-room/sim";
import type { Pos, Sim, SimEvent } from "@war-room/sim";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/testbed.json", import.meta.url)), "utf8")));
const yard = (x: number, y: number): Pos => ({ floor: "grounds", x, y }) as Pos;

type Noise = Extract<SimEvent, { type: "noise" }>;
function run(sim: Sim, ticks: number): Noise[] {
  const out: Noise[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step().events.filter((e): e is Noise => e.type === "noise"));
  return out;
}
const sim = (): Sim => createSim({ seed: 1, map });
const walk = (s: Sim, to: Pos): void => s.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to });
const heardBy = (events: Noise[], who: string): Noise[] => events.filter((e) => e.observer === who);

describe("hearing", () => {
  it("is silent while nobody moves and no door changes", () => {
    expect(run(sim(), 40)).toEqual([]);
  });

  it("carries footsteps through an open window but muffles them when the shutter is closed", () => {
    const open = sim();
    walk(open, yard(18.5, 2)); // ends about 6.5 m from the defender in the hall: inside 8 m with a clear path, outside the 4 m muffled reach
    const steps = heardBy(run(open, 80), "def.test.1");
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((e) => e.kind === "steps")).toBe(true);

    const shut = sim();
    shut.enqueue({ kind: "setShutter", tick: 0, windowId: "win.t.hall.s", state: "closed" });
    walk(shut, yard(18.5, 2));
    expect(heardBy(run(shut, 80), "def.test.1").filter((e) => e.kind === "steps")).toEqual([]);
  });

  it("does not let a walker hear itself, and never names the source", () => {
    const s = sim();
    walk(s, yard(18.5, 2));
    const events = run(s, 80);
    expect(heardBy(events, "op.alpha.1").length).toBe(0);
    for (const e of events) expect(Object.keys(e).sort()).toEqual(["at", "id", "kind", "observer", "tick", "type", "v"]);
  });

  it("makes no footsteps once the walker is down", () => {
    const s = sim();
    walk(s, yard(18.5, 2));
    run(s, 5);
    const saved = JSON.parse(s.serialize()) as { entities: { id: string; state: string }[] };
    const walker = saved.entities.find((e) => e.id === "op.alpha.1");
    expect(walker).toBeDefined();
    (walker as { state: string }).state = "down";
    const copy = sim();
    copy.restore(JSON.stringify(saved));
    expect(run(copy, 80)).toEqual([]);
  });

  it("hears a door at once, near its true spot and not from far away", () => {
    const s = sim();
    s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-vault", state: "open" }); // at (22, 12)
    const events = run(s, 5);
    const near = heardBy(events, "def.test.2"); // in the study, a few metres away
    expect(near.length).toBe(1);
    expect(near[0]?.kind).toBe("door");
    expect(Math.hypot((near[0]?.at.x ?? 0) - 22, (near[0]?.at.y ?? 0) - 12)).toBeLessThanOrEqual(2.5);
    expect(heardBy(events, "def.test.3")).toEqual([]); // 19 m away in the yard, beyond 12 m
  });

  it("is deterministic, including the approximate positions, and survives a save", () => {
    const make = (): Sim => {
      const s = sim();
      walk(s, yard(18.5, 2));
      s.enqueue({ kind: "setDoor", tick: 3, doorId: "d.t.front", state: "open" });
      return s;
    };
    const a = make(), b = make();
    expect(run(a, 60)).toEqual(run(b, 60));
    expect(a.hash()).toBe(b.hash());
    const copy = createSim({ seed: 99, map });
    copy.restore(a.serialize());
    expect(run(copy, 30)).toEqual(run(a, 30));
    expect(copy.hash()).toBe(a.hash());
  });

  it("feeds each side's knowledge only with what its own units heard", () => {
    const s = sim();
    const defenders = createKnowledge(map, "defender");
    const operators = createKnowledge(map, "operator");
    walk(s, yard(18.5, 2));
    s.enqueue({ kind: "setDoor", tick: 3, doorId: "d.t.hall-vault", state: "open" });
    for (let i = 0; i < 60; i++) {
      const { snapshot, events } = s.step();
      defenders.update(snapshot, events);
      operators.update(snapshot, events);
    }
    const heardByDef = defenders.noises();
    expect(heardByDef.length).toBeGreaterThan(0);
    expect(heardByDef.length).toBeLessThanOrEqual(32);
    expect(heardByDef.some((n) => n.kind === "door")).toBe(true);
    // The operators never hear their own footsteps, and nothing the defenders hear is copied into their picture.
    expect(operators.noises().filter((n) => n.kind === "steps").length).toBe(0);
  });
});
