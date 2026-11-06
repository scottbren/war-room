import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createSim } from "@war-room/sim";
import type { Sim, SimEvent } from "@war-room/sim";

const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/testbed.json", import.meta.url)), "utf8")) as {
  floors: { id: string; cover: unknown[] }[];
};
const plain = MapFile.parse(raw);

/** The testbed plus one extra cover rectangle on the grounds. */
function withCover(type: "heavy" | "light", x0: number, y0: number, x1: number, y1: number) {
  const copy = JSON.parse(JSON.stringify(raw)) as typeof raw;
  copy.floors.find((f) => f.id === "grounds")!.cover.push({
    id: "cover.test.extra",
    rect: { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } },
    type,
    height: 0.9,
    facing: "all",
    destructible: false,
  });
  return MapFile.parse(copy);
}

interface Ent {
  id: string;
  health: number;
  state: string;
  motion?: unknown;
  pos: { floor: string; xCm: number; yCm: number };
}
interface Saved {
  tick: number;
  entities: Ent[];
  minds?: unknown[];
  suppression?: { id: string; v: number }[];
}
const place = (s: Saved, id: string, x: number, y: number): Ent => {
  const e = s.entities.find((e2) => e2.id === id)!;
  e.pos = { floor: "grounds", xCm: Math.round(x * 100), yCm: Math.round(y * 100) };
  return e;
};

/** Alerted def.test.3 at (2, 4) and op.alpha.1 5 m east of it, on the open lawn; op.alpha.2 parked in the far corner. */
function duel(map: MapFile, seed: number, tweak: (s: Saved) => void = () => {}): Sim {
  const s = JSON.parse(createSim({ seed, map }).serialize()) as Saved;
  const d = place(s, "def.test.3", 2, 4);
  place(s, "op.alpha.1", 7, 4);
  place(s, "op.alpha.2", 29, 23);
  s.minds = [{ id: "def.test.3", mode: "alerted", post: { ...d.pos }, spot: { ...d.pos }, t: s.tick }];
  tweak(s);
  const sim = createSim({ seed, map });
  sim.restore(JSON.stringify(s));
  return sim;
}
const saved = (sim: Sim): Saved => JSON.parse(sim.serialize()) as Saved;
const ent = (sim: Sim, id: string): Ent => saved(sim).entities.find((e) => e.id === id)!;
const supp = (sim: Sim, id: string): number => saved(sim).suppression?.find((s) => s.id === id)?.v ?? 0;
const run = (sim: Sim, ticks: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step().events);
  return out;
};

/** Share of the defender's first shots that hit, over many seeds. */
function hitRate(make: (seed: number) => Sim, n = 400): number {
  let hits = 0;
  for (let seed = 1; seed <= n; seed++) {
    const first = run(make(seed), 8).find((e) => e.type === "shot" && e.shooter === "def.test.3");
    expect(first).toBeDefined();
    if (first?.type === "shot" && first.hit) hits++;
  }
  return hits / n;
}
const near = (actual: number, expected: number): void => expect(Math.abs(actual - expected)).toBeLessThan(0.08);

describe("cover", () => {
  it("the target's hit chance is 80% in the open at 5 m, 40% behind heavy cover and 60% behind light cover on the shooter's side", () => {
    near(hitRate((seed) => duel(plain, seed)), 0.8);
    // A low wall 10 to 60 cm in front of the target (west of him, toward the shooter).
    near(hitRate((seed) => duel(withCover("heavy", 6.4, 3, 6.9, 5), seed)), 0.4);
    near(hitRate((seed) => duel(withCover("light", 6.4, 3, 6.9, 5), seed)), 0.6);
  }, 30_000);

  it("does not help when it is on the far side of the target from the shooter, or farther than 80 cm", () => {
    near(hitRate((seed) => duel(withCover("heavy", 7.1, 3, 7.6, 5), seed)), 0.8); // behind him
    near(hitRate((seed) => duel(withCover("heavy", 5.5, 3, 5.9, 5), seed)), 0.8); // in front, but 110 cm away
  }, 30_000);

  it("a moving target is harder to hit (75%)", () => {
    near(hitRate((seed) => duel(plain, seed, (s) => {
      const op = s.entities.find((e) => e.id === "op.alpha.1")!;
      op.state = "moving";
      op.motion = { toXCm: 700, toYCm: 3000, speedCmPerTick: 5 };
    })), 0.6);
  });
});

describe("suppression", () => {
  it("a shot suppresses its target (25 on a hit, 10 on a miss) and enemies within 2 m of its path, and no one else", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = duel(plain, seed, (s) => {
        place(s, "op.alpha.2", 6.9, 5.5); // 1.5 m off the path, just beyond the target
      });
      let first: SimEvent | undefined;
      while (!first) first = sim.step().events.find((e) => e.type === "shot" && e.shooter === "def.test.3");
      if (first.type !== "shot") throw new Error("unreachable");
      expect(supp(sim, "op.alpha.1")).toBe(first.hit ? 25 : 10);
      expect(supp(sim, "op.alpha.2")).toBe(10);
      expect(supp(sim, "def.test.3")).toBe(0);
    }
    const far = duel(plain, 1, (s) => {
      place(s, "op.alpha.2", 6.9, 7); // 3 m off the path
    });
    run(far, 8);
    expect(supp(far, "op.alpha.2")).toBe(0);
  });

  it("decays by 1 per tick and is gone at zero; it is capped at 100", () => {
    const quiet = duel(plain, 1, (s) => {
      place(s, "op.alpha.1", 29, 21); // out of the fight, with no one to see him
      s.minds = [];
      s.suppression = [{ id: "op.alpha.1", v: 12 }];
    });
    run(quiet, 5);
    expect(supp(quiet, "op.alpha.1")).toBe(7);
    run(quiet, 7);
    expect(supp(quiet, "op.alpha.1")).toBe(0);
    expect(saved(quiet).suppression).toBeUndefined(); // quiet state again

    const hot = duel(plain, 1, (s) => { s.suppression = [{ id: "op.alpha.1", v: 99 }]; });
    let top = 0;
    for (let i = 0; i < 60; i++) {
      hot.step();
      top = Math.max(top, supp(hot, "op.alpha.1"));
    }
    expect(top).toBe(100);
  });

  it("a suppressed shooter aims worse: 60% of normal at 50+, 40% at 80+", () => {
    near(hitRate((seed) => duel(plain, seed, (s) => { s.suppression = [{ id: "def.test.3", v: 60 }]; })), 0.48);
    near(hitRate((seed) => duel(plain, seed, (s) => { s.suppression = [{ id: "def.test.3", v: 85 }]; })), 0.32);
    near(hitRate((seed) => duel(plain, seed, (s) => { s.suppression = [{ id: "def.test.3", v: 40 }]; })), 0.8); // below 50: no effect
  }, 30_000);

  it("a unit at 80+ does not advance until it recovers", () => {
    const sim = duel(plain, 1, (s) => {
      s.minds = [];
      const op = place(s, "op.alpha.1", 29, 16);
      op.state = "moving";
      op.motion = { toXCm: 2900, toYCm: 2000, speedCmPerTick: 20 };
      s.suppression = [{ id: "op.alpha.1", v: 85 }];
    });
    run(sim, 5);
    expect(ent(sim, "op.alpha.1").pos).toMatchObject({ xCm: 2900, yCm: 1600 }); // pinned (85 down to 80)
    run(sim, 30);
    expect(ent(sim, "op.alpha.1").pos.yCm).toBeGreaterThan(1600); // recovered below 80 and walks on
  });

  it("a downed unit has no suppression", () => {
    const sim = duel(plain, 1, (s) => {
      s.entities.find((e) => e.id === "op.alpha.1")!.health = 1;
      s.suppression = [{ id: "op.alpha.1", v: 50 }];
    });
    const all = run(sim, 100);
    expect(all.some((e) => e.type === "down" && e.entity === "op.alpha.1")).toBe(true);
    expect(supp(sim, "op.alpha.1")).toBe(0);
  });

  it("restores exactly in the middle of a firefight and refuses bad suppression", () => {
    const a = duel(plain, 7);
    run(a, 12);
    expect(saved(a).suppression).toBeDefined();
    const copy = createSim({ seed: 99, map: plain });
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    expect(run(copy, 100)).toEqual(run(a, 100));
    expect(copy.hash()).toBe(a.hash());

    const base = saved(duel(plain, 7));
    const bad = (change: (s: Saved) => void): string => {
      const s = JSON.parse(JSON.stringify(base)) as Saved;
      change(s);
      return JSON.stringify(s);
    };
    const fresh = (): Sim => createSim({ seed: 1, map: plain });
    expect(() => fresh().restore(bad((s) => { s.suppression = [{ id: "op.alpha.1", v: 0 }]; }))).toThrow();
    expect(() => fresh().restore(bad((s) => { s.suppression = [{ id: "op.alpha.1", v: 101 }]; }))).toThrow();
    expect(() => fresh().restore(bad((s) => { s.suppression = [{ id: "nobody", v: 5 }]; }))).toThrow();
    expect(() => fresh().restore(bad((s) => { s.suppression = [{ id: "op.alpha.1", v: 5 }, { id: "op.alpha.1", v: 6 }]; }))).toThrow();
    expect(() => fresh().restore(bad((s) => {
      const e = s.entities.find((x) => x.id === "op.alpha.1")!;
      e.state = "down";
      e.health = 0;
      s.suppression = [{ id: "op.alpha.1", v: 5 }];
    }))).toThrow();
    fresh().restore(bad((s) => { s.suppression = [{ id: "op.alpha.1", v: 5 }]; }));
  });
});
