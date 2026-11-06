import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile, Mission } from "@war-room/content";
import { createKnowledge, createSim } from "@war-room/sim";
import type { Sim, SimEvent } from "@war-room/sim";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const map = MapFile.parse(JSON.parse(read("../../content/maps/testbed.json")));
const mission = Mission.parse(JSON.parse(read("../../content/missions/testbed.json")));

interface Ent {
  id: string;
  health: number;
  state: string;
  facing: number;
  reload?: number;
  pos: { floor: string; xCm: number; yCm: number };
  motion?: unknown;
}
interface Saved {
  tick: number;
  entities: Ent[];
  minds?: { id: string; mode: string; post?: unknown; spot?: unknown; t?: number }[];
}
const place = (state: Saved, id: string, x: number, y: number, floor = "grounds"): Ent => {
  const e = state.entities.find((x2) => x2.id === id)!;
  e.pos = { floor, xCm: Math.round(x * 100), yCm: Math.round(y * 100) };
  return e;
};
const alerted = (state: Saved, id: string): void => {
  const e = state.entities.find((x) => x.id === id)!;
  state.minds = [...(state.minds ?? []), { id, mode: "alerted", post: { ...e.pos }, spot: { ...e.pos }, t: state.tick }];
};

/**
 * A duel on the open lawn south of the house: alerted def.test.3 at (2, 4), facing east, and op.alpha.1 `d` metres east
 * of it; the other operator is parked in the far corner so he is not the closest target.
 */
function duel(seed: number, d: number, tweak: (s: Saved) => void = () => {}): Sim {
  const state = JSON.parse(createSim({ seed, map }).serialize()) as Saved;
  place(state, "def.test.3", 2, 4);
  place(state, "op.alpha.1", 2 + d, 4);
  place(state, "op.alpha.2", 29, 23);
  alerted(state, "def.test.3");
  tweak(state);
  const sim = createSim({ seed, map });
  sim.restore(JSON.stringify(state));
  return sim;
}
const events = (sim: Sim, ticks: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step().events);
  return out;
};
const saved = (sim: Sim): Saved => JSON.parse(sim.serialize()) as Saved;
const ent = (sim: Sim, id: string): Ent => saved(sim).entities.find((e) => e.id === id)!;

describe("combat", () => {
  it("hits about as often as the table says: 80% at 5 m, 55% at 15 m", () => {
    for (const [d, expected] of [[5, 0.8], [15, 0.55]] as const) {
      let hits = 0;
      const n = 300;
      for (let seed = 1; seed <= n; seed++) {
        const first = events(duel(seed, d), 8).find((e) => e.type === "shot" && e.shooter === "def.test.3");
        expect(first).toBeDefined();
        if (first?.type === "shot" && first.hit) hits++;
      }
      expect(Math.abs(hits / n - expected)).toBeLessThan(0.08);
    }
  });

  it("a hit does 15 to 35 damage, and health at zero downs the unit: it stays down and stops shooting", () => {
    const sim = duel(1, 5);
    const all = events(sim, 400);
    const downs = all.filter((e) => e.type === "down");
    expect(downs.length).toBeGreaterThan(0);
    const first = downs[0]!;
    const dead = ent(sim, first.type === "down" ? first.entity : "");
    expect(dead).toMatchObject({ health: 0, state: "down" });
    expect(dead.motion).toBeUndefined();
    expect(dead.reload).toBeUndefined();
    expect(all.some((e) => e.type === "shot" && e.shooter === dead.id && e.tick > first.tick)).toBe(false);

    const watch = duel(2, 5);
    let before = 100;
    for (let i = 0; i < 400; i++) {
      watch.step();
      const h = ent(watch, "op.alpha.1").health;
      if (h < before && h > 0) {
        expect(before - h).toBeGreaterThanOrEqual(15);
        expect(before - h).toBeLessThanOrEqual(35);
      }
      before = h;
    }
  });

  it("holds fire until the fight is on: an unaware defender who cannot see him does not shoot, and he does not shoot it", () => {
    const state = JSON.parse(createSim({ seed: 1, map }).serialize()) as Saved;
    place(state, "def.test.3", 2, 4);
    place(state, "op.alpha.1", -3, 4); // 5 m behind def.test.3, who faces east: it cannot see him; he can see it (all round)
    place(state, "op.alpha.2", 29, 23);
    const sim = createSim({ seed: 1, map });
    sim.restore(JSON.stringify(state));
    const all = events(sim, 60);
    expect(all.some((e) => e.type === "contact" && e.observer === "op.alpha.1" && e.target === "def.test.3")).toBe(true); // he does see it
    expect(all.some((e) => e.type === "contact" && e.observer === "def.test.3")).toBe(false); // it does not see him
    expect(all.filter((e) => e.type === "shot")).toEqual([]);
  });

  it("a unit with a target stands and shoots, then walks on once the target is down", () => {
    const sim = duel(1, 5, (s) => {
      const op = s.entities.find((e) => e.id === "op.alpha.1")!;
      op.motion = { toXCm: -300, toYCm: 400, speedCmPerTick: 20 }; // ordered to walk off to the west, along the lawn
      s.entities.find((e) => e.id === "def.test.3")!.health = 40; // two or three hits
    });
    let stillWhileFiring = true;
    let last = ent(sim, "op.alpha.1").pos;
    let lastState = "idle";
    let sawFiring = false;
    let downSeen = false;
    for (let i = 0; i < 200; i++) {
      for (const e of sim.step().events) if (e.type === "down" && e.entity === "def.test.3") downSeen = true;
      const op = ent(sim, "op.alpha.1");
      if (op.state === "firing") {
        sawFiring = true;
        // (On the tick he starts firing he has just taken his last step; from then on he stands still.)
        if (lastState === "firing" && (op.pos.xCm !== last.xCm || op.pos.yCm !== last.yCm)) stillWhileFiring = false;
      }
      last = op.pos;
      lastState = op.state;
    }
    expect(sawFiring).toBe(true);
    expect(stillWhileFiring).toBe(true);
    expect(downSeen).toBe(true);
    expect(ent(sim, "op.alpha.1").pos).toMatchObject({ xCm: -300, yCm: 400 }); // finished the walk
  });

  it("makes a loud noise that the other side hears, but never the shooter itself", () => {
    const all = events(duel(1, 5), 40);
    const heard = all.filter((e) => e.type === "noise" && e.kind === "shot");
    expect(heard.length).toBeGreaterThan(0);
    // Every shot noise is heard by someone other than the unit that fired it.
    const shotsByTick = new Map<number, string[]>();
    for (const e of all) if (e.type === "shot") shotsByTick.set(e.tick, [...(shotsByTick.get(e.tick) ?? []), e.shooter]);
    for (const n of heard) {
      if (n.type !== "noise") continue;
      const shooters = shotsByTick.get(n.tick) ?? [];
      expect(shooters.some((s) => s !== n.observer)).toBe(true);
      // A defender hears only operators' shots and vice versa.
      for (const s of shooters) expect(s.startsWith("op.") !== n.observer.startsWith("op.") || s === n.observer).toBe(true);
    }
  });

  it("never shoots family, the principal or civilians", () => {
    const state = JSON.parse(createSim({ seed: 1, map, mission }).serialize()) as Saved;
    place(state, "def.test.3", 2, 4);
    place(state, "op.alpha.1", 8, 4);
    place(state, "op.alpha.2", 29, 23);
    place(state, "family.wife", 5, 4);
    place(state, "principal", 6, 5);
    alerted(state, "def.test.3");
    const sim = createSim({ seed: 1, map, mission });
    sim.restore(JSON.stringify(state));
    const all = events(sim, 200);
    expect(all.some((e) => e.type === "shot")).toBe(true); // there was a fight, with them standing right in it
    for (const id of ["family.wife", "principal"]) {
      expect(ent(sim, id).health).toBe(100);
      expect(ent(sim, id).state).not.toBe("down");
    }
  });

  it("a downed operator in view does not keep the defenders alerted forever", () => {
    const sim = duel(1, 5, (s) => {
      const op = s.entities.find((e) => e.id === "op.alpha.1")!;
      op.state = "down";
      op.health = 0;
    });
    const modes: string[] = [];
    for (let i = 0; i < 260; i++) {
      sim.step();
      const mind = saved(sim).minds?.find((m) => m.id === "def.test.3");
      const mode = mind?.mode ?? "routine";
      if (modes[modes.length - 1] !== mode) modes.push(mode);
    }
    expect(modes[0]).toBe("alerted");
    expect(modes).toContain("suspicious"); // the 15 s calm-down ran: the body does not count as a live threat
  });

  it("is deterministic, restores exactly in the middle of a firefight, and refuses a bad reload", () => {
    const a = duel(7, 5), b = duel(7, 5);
    events(a, 12);
    events(b, 12);
    expect(a.hash()).toBe(b.hash());
    expect(saved(a).entities.some((e) => e.reload !== undefined)).toBe(true);
    const copy = createSim({ seed: 99, map });
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    expect(events(copy, 100)).toEqual(events(a, 100));
    expect(copy.hash()).toBe(a.hash());

    const bad = saved(duel(7, 5));
    bad.entities.find((e) => e.id === "op.alpha.1")!.reload = -1;
    expect(() => createSim({ seed: 1, map }).restore(JSON.stringify(bad))).toThrow();
    const downed = saved(duel(7, 5));
    const e = downed.entities.find((x) => x.id === "op.alpha.1")!;
    e.state = "down";
    e.reload = 5;
    expect(() => createSim({ seed: 1, map }).restore(JSON.stringify(downed))).toThrow();
  });

  it("is seen through each side's knowledge: shots it sees and casualties it sees, and nothing else", () => {
    const sim = duel(1, 5);
    const ops = createKnowledge(map, "operator");
    const defs = createKnowledge(map, "defender");
    for (let i = 0; i < 300; i++) {
      const { snapshot, events: ev } = sim.step();
      ops.update(snapshot, ev);
      defs.update(snapshot, ev);
    }
    expect(ops.shots().length).toBeGreaterThan(0);
    for (const e of saved(sim).entities.filter((x) => x.state === "down")) {
      const known = ops.unit(e.id) ?? defs.unit(e.id);
      expect(known?.down).toBe(true);
    }
    // Nobody learns of def.test.1 or def.test.2, who were never in view of the operators.
    expect(ops.unit("def.test.1")).toBeUndefined();
    expect(ops.unit("def.test.2")).toBeUndefined();
  });
});
