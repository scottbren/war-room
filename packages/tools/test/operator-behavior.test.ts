import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createSim } from "@war-room/sim";
import type { Sim, SimEvent } from "@war-room/sim";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/testbed.json", import.meta.url)), "utf8")));

interface Pos { floor: string; xCm: number; yCm: number }
interface Ent { id: string; health: number; state: string; facing: number; pos: Pos; motion?: { toXCm: number; toYCm: number; speedCmPerTick?: number } }
interface Saved {
  tick: number;
  entities: Ent[];
  minds?: { id: string; mode: string; post: Pos; spot: Pos; t: number; cover?: Pos }[];
  suppression?: { id: string; v: number }[];
  sight?: { k: string; t: number }[];
  roe?: string;
  opCover?: ({ id: string } & Pos)[];
}
const at = (x: number, y: number): Pos => ({ floor: "grounds", xCm: Math.round(x * 100), yCm: Math.round(y * 100) });
const place = (s: Saved, id: string, x: number, y: number): Ent => {
  const e = s.entities.find((e2) => e2.id === id)!;
  e.pos = at(x, y);
  return e;
};
const saved = (sim: Sim): Saved => JSON.parse(sim.serialize()) as Saved;
const ent = (sim: Sim, id: string): Ent => saved(sim).entities.find((e) => e.id === id)!;
const run = (sim: Sim, ticks: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step().events);
  return out;
};
const dist = (p: Pos, x: number, y: number): number => Math.hypot(p.xCm / 100 - x, p.yCm / 100 - y);
const make = (s: Saved, seed = 1): Sim => {
  const sim = createSim({ seed, map });
  sim.restore(JSON.stringify(s));
  return sim;
};

/**
 * op.alpha.1 stands at (12, 4) on the lawn, with alerted def.test.3 16 m east at (28, 4) facing him. The only cover
 * nearby is the planter at x 16-18, y 2-3, whose west face is the good side. op.alpha.1 is already under fire.
 */
function fight(tweak: (s: Saved) => void = () => {}, seed = 1): Sim {
  const s = JSON.parse(createSim({ seed, map }).serialize()) as Saved;
  place(s, "op.alpha.1", 12, 4);
  place(s, "op.alpha.2", 29, 23);
  place(s, "def.test.1", 2, 22); // the other two defenders are out of it (the radio would bring them into the fight)
  place(s, "def.test.2", 3, 22);
  const d = place(s, "def.test.3", 28, 4);
  s.entities.find((e) => e.id === "op.alpha.1")!.health = 5000; // the test is about where he goes, not whether he survives
  d.facing = 270;
  // (The defender has already chosen to stay where it is; otherwise it would run for the same planter and end up within 10 m.)
  s.minds = [{ id: "def.test.3", mode: "alerted", post: { ...d.pos }, spot: at(12, 4), t: s.tick, cover: { ...d.pos } }];
  s.suppression = [{ id: "op.alpha.1", v: 40 }];
  tweak(s);
  return make(s, seed);
}
/** An unaware defender at (2, 4) facing away, and op.alpha.1 5 m east of it, who can see it but is not seen. */
function sneak(tweak: (s: Saved) => void = () => {}): Sim {
  const s = JSON.parse(createSim({ seed: 1, map }).serialize()) as Saved;
  const d = place(s, "def.test.3", 2, 4);
  d.facing = 270;
  place(s, "op.alpha.1", 7, 4);
  place(s, "op.alpha.2", 29, 23);
  tweak(s);
  return make(s);
}
const shotsBy = (events: SimEvent[], id: string): number => events.filter((e) => e.type === "shot" && e.shooter === id).length;

describe("operator behavior", () => {
  it("a standing operator under fire who sees a defender takes the cover near him on that defender's side", () => {
    const sim = fight();
    run(sim, 6);
    expect(saved(sim).opCover?.[0]?.id).toBe("op.alpha.1");
    run(sim, 60);
    const op = ent(sim, "op.alpha.1");
    expect(op.state).not.toBe("down");
    expect(dist(op.pos, 15.5, 2.5)).toBeLessThan(0.3);
  });

  it("a pinned operator (suppression 80+) can still move to cover, though he will not advance", () => {
    const sim = fight((s) => { s.suppression = [{ id: "op.alpha.1", v: 95 }]; });
    run(sim, 70);
    expect(dist(ent(sim, "op.alpha.1").pos, 15.5, 2.5)).toBeLessThan(0.3);
  });

  it("keeps to a move order: an operator who is walking under fire does not turn aside for cover", () => {
    const sim = fight((s) => {
      const op = s.entities.find((e) => e.id === "op.alpha.1")!;
      op.state = "moving";
      op.motion = { toXCm: 1200, toYCm: 1500, speedCmPerTick: 20 };
    });
    run(sim, 6);
    expect(saved(sim).opCover).toBeUndefined();
    expect(ent(sim, "op.alpha.1").motion).toMatchObject({ toXCm: 1200, toYCm: 1500 });
  });

  it("a move order from the player cancels the cover he took", () => {
    const sim = fight();
    run(sim, 6);
    expect(saved(sim).opCover).toBeDefined();
    sim.enqueue({ kind: "move", tick: saved(sim).tick, entity: "op.alpha.1", to: { floor: "grounds", x: 8, y: 4 } });
    run(sim, 1);
    expect(saved(sim).opCover).toBeUndefined();
  });

  it("does not stop to shoot while running for cover, unless a defender is within 10 m", () => {
    const sim = fight();
    let ranAndShot = false;
    let shotInCover = false;
    for (let i = 0; i < 120; i++) {
      const before = saved(sim);
      const opBefore = before.entities.find((e) => e.id === "op.alpha.1")!;
      const movingBefore = opBefore.motion !== undefined;
      // (The defender runs for cover too and may end up within 10 m of him; that is the point-blank exception, so only count shots with all defenders farther than 11 m.)
      const nearest = Math.min(...before.entities.filter((e) => e.id.startsWith("def.") && e.state !== "down").map((e) => dist(e.pos, opBefore.pos.xCm / 100, opBefore.pos.yCm / 100)));
      const shots = sim.step().events.filter((e) => e.type === "shot" && e.shooter === "op.alpha.1");
      const op = ent(sim, "op.alpha.1");
      if (shots.length > 0 && movingBefore && op.motion !== undefined && nearest > 11) ranAndShot = true;
      if (shots.length > 0 && op.motion === undefined && dist(op.pos, 15.5, 2.5) < 0.3) shotInCover = true;
      if (op.state === "down" || ent(sim, "def.test.3").state === "down") break;
    }
    expect(ranAndShot).toBe(false);
    expect(shotInCover).toBe(true);
  });

  it("forgets the cover when the fight is over, and when the operator is down", () => {
    const over = fight((s) => {
      place(s, "def.test.3", 29, 12); // out of sight
      s.minds = [];
      s.suppression = [];
      s.opCover = [{ id: "op.alpha.1", ...at(15.5, 2.5) }];
    });
    run(over, 2);
    expect(saved(over).opCover).toBeUndefined();

    const down = fight((s) => {
      const op = s.entities.find((e) => e.id === "op.alpha.1")!;
      op.state = "down";
      op.health = 0;
      s.suppression = [];
      s.opCover = undefined;
    });
    run(down, 2);
    expect(saved(down).opCover).toBeUndefined();
  });

  it("rules of engagement: 'return' (the default) never fires first, 'free' fires at an unaware defender, 'hold' never fires", () => {
    expect(shotsBy(run(sneak(), 60), "op.alpha.1")).toBe(0);
    expect(shotsBy(run(sneak((s) => { s.roe = "free"; }), 60), "op.alpha.1")).toBeGreaterThan(0);
    expect(shotsBy(run(sneak((s) => { s.roe = "hold"; }), 60), "op.alpha.1")).toBe(0);

    // With the defender already shooting at him, 'return' fires back and 'hold' does not.
    const hot = (roe?: string) => fight((s) => {
      place(s, "op.alpha.1", 20, 4);
      s.opCover = undefined;
      s.suppression = [];
      if (roe) s.roe = roe;
    });
    expect(shotsBy(run(hot(), 60), "op.alpha.1")).toBeGreaterThan(0);
    expect(shotsBy(run(hot("hold"), 60), "op.alpha.1")).toBe(0);
    expect(shotsBy(run(hot("hold"), 60), "def.test.3")).toBeGreaterThan(0);
  });

  it("is deterministic, restores exactly in the middle of a run for cover, and refuses bad rules or cover", () => {
    const a = fight(), b = fight();
    run(a, 12);
    run(b, 12);
    expect(a.hash()).toBe(b.hash());
    expect(ent(a, "op.alpha.1").motion).toBeDefined(); // still on its way
    const copy = createSim({ seed: 99, map });
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    expect(run(copy, 150)).toEqual(run(a, 150));
    expect(copy.hash()).toBe(a.hash());

    const base = saved(fight());
    const bad = (change: (s: Saved) => void): string => {
      const s = JSON.parse(JSON.stringify(base)) as Saved;
      change(s);
      return JSON.stringify(s);
    };
    const fresh = (): Sim => createSim({ seed: 1, map });
    expect(() => fresh().restore(bad((s) => { s.roe = "return"; }))).toThrow(); // the default is never written
    expect(() => fresh().restore(bad((s) => { s.roe = "panic"; }))).toThrow();
    expect(() => fresh().restore(bad((s) => { s.opCover = [{ id: "def.test.3", ...at(1, 1) }]; }))).toThrow(); // not an operator
    expect(() => fresh().restore(bad((s) => { s.opCover = [{ id: "op.alpha.1", floor: "nowhere", xCm: 0, yCm: 0 }]; }))).toThrow();
    expect(() => fresh().restore(bad((s) => { s.opCover = [{ id: "op.alpha.1", ...at(1, 1) }, { id: "op.alpha.1", ...at(2, 2) }]; }))).toThrow();
    fresh().restore(bad((s) => { s.roe = "free"; s.opCover = [{ id: "op.alpha.1", ...at(15.5, 2.5) }]; }));
  });
});
