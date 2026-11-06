import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile, Mission } from "@war-room/content";
import { createSim } from "@war-room/sim";
import type { Sim, SimEvent } from "@war-room/sim";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const map = MapFile.parse(JSON.parse(read("../../content/maps/testbed.json")));
const mission = Mission.parse(JSON.parse(read("../../content/missions/testbed.json")));

interface Pos { floor: string; xCm: number; yCm: number }
interface Ent { id: string; health: number; state: string; pos: Pos; motion?: unknown }
interface MindOut { id: string; mode: string; cover?: Pos; fallback?: boolean; post: Pos; spot: Pos; t: number }
interface Saved {
  tick: number;
  entities: Ent[];
  minds?: MindOut[];
  suppression?: { id: string; v: number }[];
  opCover?: ({ id: string } & Pos)[];
  sight?: { k: string; t: number }[];
}
const place = (s: Saved, id: string, x: number, y: number): Ent => {
  const e = s.entities.find((e2) => e2.id === id)!;
  e.pos = { floor: "grounds", xCm: Math.round(x * 100), yCm: Math.round(y * 100) };
  return e;
};
const at = (x: number, y: number): Pos => ({ floor: "grounds", xCm: Math.round(x * 100), yCm: Math.round(y * 100) });
const saved = (sim: Sim): Saved => JSON.parse(sim.serialize()) as Saved;
const ent = (sim: Sim, id: string): Ent => saved(sim).entities.find((e) => e.id === id)!;
const mind = (sim: Sim, id: string): MindOut | undefined => saved(sim).minds?.find((m) => m.id === id);
const dist = (a: Pos, x: number, y: number): number => Math.hypot(a.xCm / 100 - x, a.yCm / 100 - y);

/**
 * def.test.3 stands at (12, 4) on the lawn, alerted to a threat 12 m east at (24, 4), and is under fire (suppression 5).
 * The only cover nearby is the planter at x 16-18, y 2-3, whose west face is the good side.
 */
function underFire(tweak: (s: Saved) => void = () => {}, withMission = false): Sim {
  const opts = withMission ? { seed: 1, map, mission } : { seed: 1, map };
  const s = JSON.parse(createSim(opts).serialize()) as Saved;
  const d = place(s, "def.test.3", 12, 4);
  place(s, "op.alpha.1", 29, 22);
  place(s, "op.alpha.2", 29, 23);
  s.minds = [{ id: "def.test.3", mode: "alerted", post: { ...d.pos }, spot: at(24, 4), t: s.tick }];
  s.suppression = [{ id: "def.test.3", v: 5 }];
  tweak(s);
  const sim = createSim(opts);
  sim.restore(JSON.stringify(s));
  return sim;
}
const run = (sim: Sim, ticks: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step().events);
  return out;
};

describe("defender combat behavior", () => {
  it("an alerted defender under fire moves to the cover near it on the threat's side, and stays there", () => {
    const sim = underFire();
    run(sim, 1);
    expect(mind(sim, "def.test.3")?.cover).toBeDefined();
    expect(ent(sim, "def.test.3").motion).toBeDefined();
    run(sim, 60); // (after 15 s of quiet it would calm down and go to look)
    const end = ent(sim, "def.test.3");
    expect(dist(end.pos, 15.5, 2.5)).toBeLessThan(0.3); // just west of the planter, which is between him and the threat
    expect(end.motion).toBeUndefined();
    expect(mind(sim, "def.test.3")?.mode).not.toBe("routine");
  });

  it("does not choose a place that has no cover against the threat, and stays put when no cover is near", () => {
    // The threat is to the west now: the planter's east face is the good side.
    const west = underFire((s) => {
      s.minds![0]!.spot = at(0, 4);
      place(s, "def.test.3", 20, 4);
      s.minds![0]!.post = at(20, 4);
    });
    run(west, 150);
    expect(dist(ent(west, "def.test.3").pos, 18.5, 2.5)).toBeLessThan(0.3);

    const far = underFire((s) => {
      place(s, "def.test.3", 5, 20);
      s.minds![0]!.post = at(5, 20);
    });
    run(far, 30);
    expect(ent(far, "def.test.3").pos).toMatchObject({ xCm: 500, yCm: 2000 });
    expect(mind(far, "def.test.3")?.cover).toMatchObject({ xCm: 500, yCm: 2000 }); // decided once: its own place
  });

  it("stays where it is when it is already covered, and picks only once per alert", () => {
    const covered = underFire((s) => {
      place(s, "def.test.3", 15.5, 2.5);
    });
    run(covered, 30);
    expect(ent(covered, "def.test.3").pos).toMatchObject({ xCm: 1550, yCm: 250 });

    const sim = underFire();
    run(sim, 1);
    const first = mind(sim, "def.test.3")?.cover;
    sim.restore(JSON.stringify({ ...saved(sim), suppression: [{ id: "def.test.3", v: 50 }] }));
    run(sim, 3);
    expect(mind(sim, "def.test.3")?.cover).toEqual(first);
  });

  it("two defenders do not take the same spot", () => {
    const sim = underFire((s) => {
      const d = place(s, "def.test.2", 12, 5);
      s.minds!.push({ id: "def.test.2", mode: "alerted", post: { ...d.pos }, spot: at(24, 4), t: s.tick });
      s.suppression!.push({ id: "def.test.2", v: 5 });
      s.minds!.sort((a, b) => (a.id < b.id ? -1 : 1));
      s.suppression!.sort((a, b) => (a.id < b.id ? -1 : 1));
    });
    run(sim, 1);
    const a = mind(sim, "def.test.2")?.cover;
    const b = mind(sim, "def.test.3")?.cover;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Math.hypot(a!.xCm - b!.xCm, a!.yCm - b!.yCm)).toBeGreaterThanOrEqual(100);
  });

  it("does not stop to shoot while running for cover, but shoots once there", () => {
    const sim = underFire((s) => {
      // (He has chosen to stay where he is, and is kept busy being suppressed, so only the defender's behavior is under test.)
      s.opCover = [{ id: "op.alpha.1", ...at(28, 4) }];
      s.suppression!.push({ id: "op.alpha.1", v: 100 });
      place(s, "op.alpha.1", 28, 4); // the threat is real: an operator 16 m away, in view, and still over 10 m from the cover
    });
    let ranAndShot = false;
    let shotInCover = false;
    for (let i = 0; i < 200; i++) {
      const movingBefore = ent(sim, "def.test.3").motion !== undefined;
      const shots = sim.step().events.filter((e) => e.type === "shot" && e.shooter === "def.test.3");
      const d = ent(sim, "def.test.3");
      if (shots.length > 0 && movingBefore && d.motion !== undefined) ranAndShot = true;
      if (shots.length > 0 && d.motion === undefined && dist(d.pos, 15.5, 2.5) < 0.3) shotInCover = true;
      if (d.state === "down") break;
    }
    expect(ranAndShot).toBe(false);
    expect(shotInCover).toBe(true);
  });

  it("falls back toward the principal when it sees more operators than it has allies", () => {
    // Two operators in plain view 12 m away; they and the defender trade fire, and once it is shot at it runs for the principal.
    const sim = underFire((s) => {
      place(s, "principal", 2, 20);
      place(s, "op.alpha.1", 24, 4);
      place(s, "op.alpha.2", 24, 5);
      s.suppression = [];
      s.entities.find((e) => e.id === "def.test.3")!.health = 100;
    }, true);
    let fell = -1;
    let before = 0;
    for (let i = 0; i < 80 && fell < 0; i++) {
      sim.step();
      if (mind(sim, "def.test.3")?.fallback) {
        fell = i;
        before = dist(ent(sim, "def.test.3").pos, 2, 20);
      }
    }
    expect(fell).toBeGreaterThanOrEqual(0);
    expect(mind(sim, "def.test.3")?.cover).toBeUndefined();
    run(sim, 30);
    const d = ent(sim, "def.test.3");
    expect(d.state === "down" || dist(d.pos, 2, 20) < before).toBe(true);
  });

  it("goes back to normal once it calms down, with no cover or fallback left in its mind", () => {
    const sim = underFire();
    run(sim, 1);
    expect(mind(sim, "def.test.3")?.cover).toBeDefined();
    const modes: string[] = [];
    for (let i = 0; i < 700; i++) {
      sim.step();
      const m = mind(sim, "def.test.3");
      if (m && m.mode !== "alerted") expect(m.cover).toBeUndefined();
      const mode = m?.mode ?? "routine";
      if (modes[modes.length - 1] !== mode) modes.push(mode);
    }
    expect(modes).toEqual(["alerted", "suspicious", "returning", "routine"]);
  });

  it("is deterministic, restores exactly in the middle of a run for cover, and refuses a bad cover or fallback", () => {
    const a = underFire(), b = underFire();
    run(a, 15);
    run(b, 15);
    expect(a.hash()).toBe(b.hash());
    expect(ent(a, "def.test.3").motion).toBeDefined(); // still on its way
    const copy = createSim({ seed: 99, map });
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    expect(run(copy, 200)).toEqual(run(a, 200));
    expect(copy.hash()).toBe(a.hash());

    const base = saved(underFire());
    run(underFire(), 0);
    const bad = (change: (m: Record<string, unknown>) => void): string => {
      const s = JSON.parse(JSON.stringify(base)) as { minds: Record<string, unknown>[] };
      change(s.minds[0]!);
      return JSON.stringify(s);
    };
    const fresh = (): Sim => createSim({ seed: 1, map });
    expect(() => fresh().restore(bad((m) => { m["cover"] = { floor: "nowhere", xCm: 0, yCm: 0 }; }))).toThrow();
    expect(() => fresh().restore(bad((m) => { m["cover"] = { floor: "grounds", xCm: 0, yCm: 0 }; m["mode"] = "suspicious"; }))).toThrow();
    expect(() => fresh().restore(bad((m) => { m["fallback"] = false; }))).toThrow();
    expect(() => fresh().restore(bad((m) => { m["fallback"] = true; m["mode"] = "returning"; }))).toThrow();
    fresh().restore(bad((m) => { m["cover"] = { floor: "grounds", xCm: 1550, yCm: 250 }; m["fallback"] = true; }));
  });
});
