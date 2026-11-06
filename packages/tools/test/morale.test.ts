import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createSim } from "@war-room/sim";
import type { Sim, SimEvent } from "@war-room/sim";

const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/testbed.json", import.meta.url)), "utf8")) as {
  markers: { id: string; tags: string[] }[];
};
const plain = MapFile.parse(raw);

/** The testbed with extra tags on spawn markers, e.g. { "m.spawn.def3": ["guard:hired"] }. */
function tagged(extra: Record<string, string[]>): MapFile {
  const copy = JSON.parse(JSON.stringify(raw)) as typeof raw;
  for (const m of copy.markers) if (extra[m.id]) m.tags.push(...extra[m.id]!);
  return MapFile.parse(copy);
}
const hired = tagged({ "m.spawn.def3": ["guard:hired"] });

interface Pos { floor: string; xCm: number; yCm: number }
interface Ent { id: string; health: number; state: string; facing: number; pos: Pos; motion?: unknown }
interface MindOut { id: string; mode: string; post: Pos; spot: Pos; t: number; relay?: unknown; cover?: Pos; fallback?: boolean; waitFrom?: number }
interface Saved {
  tick: number;
  entities: Ent[];
  minds?: MindOut[];
  suppression?: { id: string; v: number }[];
}
const at = (x: number, y: number): Pos => ({ floor: "grounds", xCm: Math.round(x * 100), yCm: Math.round(y * 100) });
const place = (s: Saved, id: string, x: number, y: number): Ent => {
  const e = s.entities.find((e2) => e2.id === id)!;
  e.pos = at(x, y);
  return e;
};
const saved = (sim: Sim): Saved => JSON.parse(sim.serialize()) as Saved;
const ent = (sim: Sim, id: string): Ent => saved(sim).entities.find((e) => e.id === id)!;
const mind = (sim: Sim, id: string): MindOut | undefined => saved(sim).minds?.find((m) => m.id === id);
const run = (sim: Sim, ticks: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step().events);
  return out;
};
const make = (map: MapFile, s: Saved, seed = 1): Sim => {
  const sim = createSim({ seed, map });
  sim.restore(JSON.stringify(s));
  return sim;
};

/**
 * def.test.3 is alerted at (24, 4), facing west, with the threat's last known spot at (12, 4), where op.alpha.1 stands
 * (with plenty of health). The other defenders are out of it, and op.alpha.2 is parked.
 */
function standoff(map: MapFile, tweak: (s: Saved) => void = () => {}, seed = 1): Sim {
  const s = JSON.parse(createSim({ seed, map }).serialize()) as Saved;
  place(s, "op.alpha.1", 12, 4).health = 5000;
  place(s, "op.alpha.2", 29, 23);
  place(s, "def.test.1", 2, 22);
  place(s, "def.test.2", 3, 22);
  const d = place(s, "def.test.3", 24, 4);
  d.facing = 270;
  s.minds = [{ id: "def.test.3", mode: "alerted", post: { ...d.pos }, spot: at(12, 4), t: s.tick }];
  tweak(s);
  return make(map, s, seed);
}
const setSupp = (s: Saved, id: string, v: number): void => {
  s.suppression = [...(s.suppression ?? []).filter((x) => x.id !== id), { id, v }].sort((a, b) => (a.id < b.id ? -1 : 1));
};
const shotsBy = (events: SimEvent[], id: string): number => events.filter((e) => e.type === "shot" && e.shooter === id).length;

describe("wounds", () => {
  const walk = (health: number): number => {
    const s = JSON.parse(createSim({ seed: 1, map: plain }).serialize()) as Saved;
    const op = place(s, "op.alpha.1", 6, 20);
    place(s, "op.alpha.2", 29, 23);
    op.health = health;
    op.state = "moving";
    op.motion = { toXCm: 2600, toYCm: 2000, speedCmPerTick: 20 } as never;
    const sim = make(plain, s);
    run(sim, 20);
    return ent(sim, "op.alpha.1").pos.xCm - 600;
  };

  it("a wounded unit walks at 75% speed, a badly wounded one at 50%", () => {
    const healthy = walk(100);
    expect(healthy).toBe(400);
    expect(walk(60)).toBe(300);
    expect(walk(61)).toBe(400);
    expect(walk(30)).toBe(200);
    expect(walk(31)).toBe(300);
  });

  it("a wounded unit still gets where it is going", () => {
    const s = JSON.parse(createSim({ seed: 1, map: plain }).serialize()) as Saved;
    const op = place(s, "op.alpha.1", 6, 20);
    place(s, "op.alpha.2", 29, 23);
    op.health = 10;
    op.state = "moving";
    op.motion = { toXCm: 1000, toYCm: 2000, speedCmPerTick: 1 } as never; // slower than the rounding could stall
    const sim = make(plain, s);
    run(sim, 600);
    expect(ent(sim, "op.alpha.1").pos).toMatchObject({ xCm: 1000, yCm: 2000 });
  });

  it("a wounded shooter aims worse: 68% instead of 80% at 5 m when wounded, 52% when badly wounded", () => {
    const rate = (health: number, n = 400): number => {
      let hits = 0;
      for (let seed = 1; seed <= n; seed++) {
        const s = JSON.parse(createSim({ seed, map: plain }).serialize()) as Saved;
        const d = place(s, "def.test.3", 2, 4);
        d.health = health;
        place(s, "op.alpha.1", 7, 4).health = 5000;
        place(s, "op.alpha.2", 29, 23);
        s.minds = [{ id: "def.test.3", mode: "alerted", post: { ...d.pos }, spot: at(7, 4), t: s.tick }];
        const first = run(make(plain, s, seed), 8).find((e) => e.type === "shot" && e.shooter === "def.test.3");
        expect(first).toBeDefined();
        if (first?.type === "shot" && first.hit) hits++;
      }
      return hits / n;
    };
    expect(Math.abs(rate(100) - 0.8)).toBeLessThan(0.08);
    expect(Math.abs(rate(50) - 0.68)).toBeLessThan(0.08);
    expect(Math.abs(rate(25) - 0.52)).toBeLessThan(0.08);
  }, 30_000);
});

describe("guard tag", () => {
  it("accepts hired, veteran and inner-circle on defenders, and refuses anything else", () => {
    for (const v of ["hired", "veteran", "inner-circle"]) expect(() => createSim({ seed: 1, map: tagged({ "m.spawn.def3": [`guard:${v}`] }) })).not.toThrow();
    expect(() => createSim({ seed: 1, map: tagged({ "m.spawn.def3": ["guard:boss"] }) })).toThrow(/m\.spawn\.def3.*guard:boss/);
    expect(() => createSim({ seed: 1, map: tagged({ "m.spawn.op1": ["guard:hired"] }) })).toThrow(/not a defender/);
  });
});

describe("morale", () => {
  it("a hired guard breaks at suppression 60: it stops fighting and runs from the threat", () => {
    const sim = standoff(hired, (s) => setSupp(s, "def.test.3", 65));
    run(sim, 2);
    expect(mind(sim, "def.test.3")?.mode).toBe("broken");
    expect(ent(sim, "def.test.3").motion).toBeDefined();
    const after = run(sim, 150);
    const end = ent(sim, "def.test.3").pos;
    expect(end.xCm).toBeGreaterThan(2400 + 700); // farther from the operator at x = 12 m than it started
    expect(mind(sim, "def.test.3")?.mode).toBe("broken"); // no recovery in this slice
    expect(shotsBy(after, "def.test.3")).toBe(0);
  });

  it("does not break below 60 with allies around, but does when it is alone under fire, and when badly wounded", () => {
    const calm = standoff(hired, (s) => {
      setSupp(s, "def.test.3", 45);
      const ally = place(s, "def.test.2", 25, 6);
      s.minds!.push({ id: "def.test.2", mode: "alerted", post: { ...ally.pos }, spot: at(12, 4), t: s.tick });
      s.minds!.sort((a, b) => (a.id < b.id ? -1 : 1));
    });
    run(calm, 2);
    expect(mind(calm, "def.test.3")?.mode).toBe("alerted");

    const alone = standoff(hired, (s) => setSupp(s, "def.test.3", 5));
    run(alone, 2);
    expect(mind(alone, "def.test.3")?.mode).toBe("broken");

    const untouched = standoff(hired, () => {});
    run(untouched, 2); // alone, but not under fire: it holds
    expect(mind(untouched, "def.test.3")?.mode).toBe("alerted");

    const wounded = standoff(hired, (s) => { s.entities.find((e) => e.id === "def.test.3")!.health = 30; });
    run(wounded, 2);
    expect(mind(wounded, "def.test.3")?.mode).toBe("broken");
    const hurt = standoff(hired, (s) => { s.entities.find((e) => e.id === "def.test.3")!.health = 31; });
    run(hurt, 2);
    expect(mind(hurt, "def.test.3")?.mode).toBe("alerted");
  });

  it("a pinned guard (suppression 80+) still runs, and one that was firing when it broke runs at once", () => {
    const sim = standoff(hired, (s) => {
      setSupp(s, "def.test.3", 90);
      s.entities.find((e) => e.id === "def.test.3")!.state = "firing";
    });
    run(sim, 3);
    expect(mind(sim, "def.test.3")?.mode).toBe("broken");
    run(sim, 20);
    expect(ent(sim, "def.test.3").pos.xCm).toBeGreaterThan(2400 + 150);
  });

  it("a fleeing guard does not stop to shoot even at point-blank, but a cornered one (no motion) does", () => {
    const close = (tweak: (s: Saved) => void = () => {}) => standoff(hired, (s) => {
      setSupp(s, "def.test.3", 65);
      place(s, "op.alpha.1", 20, 4); // 4 m away: point-blank
      s.minds![0]!.spot = at(20, 4);
      tweak(s);
    });
    const fleeing = close();
    run(fleeing, 1); // (combat runs before the morale check, so it fires once on the tick it breaks)
    const fled = run(fleeing, 30);
    expect(mind(fleeing, "def.test.3")?.mode).toBe("broken");
    expect(shotsBy(fled, "def.test.3")).toBe(0);
    // Cornered: it broke but has no route (the threat is on another floor), so it stays and defends itself.
    const cornered = close((s) => { s.minds![0]!.spot = { floor: "ground", xCm: 2000, yCm: 400 }; });
    expect(shotsBy(run(cornered, 40), "def.test.3")).toBeGreaterThan(0);
  });

  it("one guard breaking does not make the next one look alone: the test uses who was alerted at the start of the tick", () => {
    const both = tagged({ "m.spawn.def2": ["guard:hired"], "m.spawn.def3": ["guard:hired"] });
    const sim = standoff(both, (s) => {
      const d2 = place(s, "def.test.2", 24, 6);
      s.minds!.push({ id: "def.test.2", mode: "alerted", post: { ...d2.pos }, spot: at(12, 4), t: s.tick });
      s.minds!.sort((a, b) => (a.id < b.id ? -1 : 1));
      setSupp(s, "def.test.2", 65); // def.test.2 breaks first (it is earlier by id)
      setSupp(s, "def.test.3", 10); // def.test.3 is under fire, with an ally right beside it
    });
    run(sim, 1);
    expect(mind(sim, "def.test.2")?.mode).toBe("broken");
    expect(mind(sim, "def.test.3")?.mode).toBe("alerted");
  });

  it("veterans and inner-circle guards never break, tagged or not", () => {
    for (const map of [plain, tagged({ "m.spawn.def3": ["guard:veteran"] }), tagged({ "m.spawn.def3": ["guard:inner-circle"] })]) {
      const sim = standoff(map, (s) => {
        setSupp(s, "def.test.3", 95);
        s.entities.find((e) => e.id === "def.test.3")!.health = 10;
      });
      run(sim, 20);
      expect(mind(sim, "def.test.3")?.mode).not.toBe("broken");
    }
  });

  it("a broken guard ignores new sightings and radio calls, and operators stop shooting at it", () => {
    const sim = standoff(hired, (s) => {
      setSupp(s, "def.test.3", 65);
      place(s, "op.alpha.1", 12, 4);
    });
    run(sim, 2);
    expect(mind(sim, "def.test.3")?.mode).toBe("broken");
    // The operator can still see it for a while; he fires at alerted or firing defenders only, so he stops.
    const later = run(sim, 100);
    expect(mind(sim, "def.test.3")?.mode).toBe("broken");
    expect(shotsBy(later, "op.alpha.1")).toBe(0);
    // Another defender seeing the operator does not drag it back in.
    expect(mind(sim, "def.test.3")?.relay).toBeUndefined();
  });

  it("is deterministic, restores exactly in the middle of the run, and refuses a broken guard with leftovers", () => {
    const a = standoff(hired, (s) => setSupp(s, "def.test.3", 65)), b = standoff(hired, (s) => setSupp(s, "def.test.3", 65));
    run(a, 10);
    run(b, 10);
    expect(a.hash()).toBe(b.hash());
    expect(ent(a, "def.test.3").motion).toBeDefined(); // still running
    const copy = createSim({ seed: 99, map: hired });
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    expect(run(copy, 120)).toEqual(run(a, 120));
    expect(copy.hash()).toBe(a.hash());

    const base = saved(standoff(hired, (s) => setSupp(s, "def.test.3", 65)));
    run(standoff(hired), 0);
    const sim = standoff(hired, (s) => setSupp(s, "def.test.3", 65));
    run(sim, 3);
    const brokenState = saved(sim);
    const bad = (change: (m: MindOut) => void): string => {
      const s = JSON.parse(JSON.stringify(brokenState)) as Saved;
      change(s.minds!.find((m) => m.id === "def.test.3")!);
      return JSON.stringify(s);
    };
    const fresh = (): Sim => createSim({ seed: 1, map: hired });
    expect(base.minds![0]!.mode).toBe("alerted");
    expect(() => fresh().restore(bad((m) => { m.relay = { due: 5, spot: at(1, 1) }; }))).toThrow();
    expect(() => fresh().restore(bad((m) => { m.cover = at(1, 1); }))).toThrow();
    expect(() => fresh().restore(bad((m) => { m.fallback = true; }))).toThrow();
    expect(() => fresh().restore(bad((m) => { m.waitFrom = 1; }))).toThrow();
    fresh().restore(JSON.stringify(brokenState));
  });
});
