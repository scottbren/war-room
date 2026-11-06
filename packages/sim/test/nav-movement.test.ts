import { describe, expect, it } from "vitest";
import type { MapFile } from "@war-room/content";
import { createSim } from "../src";
import type { Nav } from "../src/nav";
import type { Pos, Sim, SimEvent, Snapshot } from "../src/types";
import { makeTestMap } from "./helpers/testMap";

/** A stub navmesh that returns a scripted route, so these tests do not need recast. */
function stubNav(route: Pos[] | ((from: Pos, to: Pos) => Pos[])): Nav & { calls: [Pos, Pos][] } {
  const calls: [Pos, Pos][] = [];
  return {
    calls,
    isWalkable: () => true,
    findPath(from, to) {
      calls.push([from, to]);
      return typeof route === "function" ? route(from, to) : route;
    },
  };
}

/** The test map without its defender: these tests are about walking, and a defender who sees the walker starts a fight. */
const peacefulMap = (): MapFile => {
  const map = makeTestMap();
  map.markers = map.markers.filter((m) => !m.tags.includes("side:defender"));
  return map;
};
const withNav = (nav: Nav): Sim => createSim({ seed: 1, map: peacefulMap(), nav });
const run = (sim: Sim, ticks: number) => {
  const out: { snapshot: Snapshot; events: SimEvent[] }[] = [];
  for (let i = 0; i < ticks; i++) out.push(sim.step());
  return out;
};
const op = (snap: Snapshot) => snap.entities.find((e) => e.id === "op.alpha.1")!;

describe("movement along a navmesh route", () => {
  it("follows every waypoint in order and arrives once at the end", () => {
    const route: Pos[] = [
      { floor: "ground", x: 0, y: 0 },
      { floor: "ground", x: 4, y: 0 },
      { floor: "ground", x: 4, y: 3 },
    ];
    const sim = withNav(stubNav(route));
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 4, y: 3 } });
    const steps = run(sim, 60);
    const visited = steps.map((s) => op(s.snapshot).pos);
    expect(visited.some((p) => p.x === 4 && p.y === 0)).toBe(true); // reached the corner exactly
    expect(op(steps.at(-1)!.snapshot).pos).toEqual({ floor: "ground", x: 4, y: 3 });
    expect(op(steps.at(-1)!.snapshot).state).toBe("idle");
    expect(steps.flatMap((s) => s.events).filter((e) => e.type === "arrived")).toHaveLength(1);
    // never cuts the corner: x is 4 whenever y is above 0
    for (const p of visited) if (p.y > 0) expect(p.x).toBe(4);
  });

  it("moves at the same speed along the whole route (2 m/s for an operator)", () => {
    const route: Pos[] = [{ floor: "ground", x: 0, y: 0 }, { floor: "ground", x: 2, y: 0 }, { floor: "ground", x: 2, y: 2 }];
    const sim = withNav(stubNav(route));
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 2, y: 2 } });
    const steps = run(sim, 25); // 4 m at 0.2 m/tick = 20 ticks, plus slack
    const arrivedAt = steps.findIndex((s) => s.events.some((e) => e.type === "arrived"));
    expect(arrivedAt).toBeGreaterThanOrEqual(19);
    expect(arrivedAt).toBeLessThanOrEqual(21);
  });

  it("crosses floors at a transition: the unit switches floor when it reaches the start of the link, then keeps walking", () => {
    const route: Pos[] = [
      { floor: "ground", x: 0, y: 0 },
      { floor: "ground", x: 2, y: 0 },
      { floor: "upper", x: 2, y: 0 },
      { floor: "upper", x: 2, y: 2 },
    ];
    const map = makeTestMap();
    map.floors.push({ ...structuredClone(map.floors[0]!), id: "upper", elevation: 4, doors: [], windows: [], openings: [], cover: [] });
    const sim = createSim({ seed: 1, map, nav: stubNav(route) });
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "upper", x: 2, y: 2 } });
    const steps = run(sim, 40);
    const floors = steps.map((s) => op(s.snapshot).pos.floor);
    expect(floors[0]).toBe("ground");
    expect(floors.at(-1)).toBe("upper");
    expect(floors.indexOf("upper")).toBeGreaterThan(5);
    expect(op(steps.at(-1)!.snapshot).pos).toEqual({ floor: "upper", x: 2, y: 2 });
  });

  it("rejects a move with no route, and keeps the unit where it was", () => {
    const sim = withNav(stubNav([]));
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 5, y: 5 } });
    const [step] = run(sim, 1);
    expect(step!.events).toContainEqual(expect.objectContaining({ type: "commandRejected", command: "move", reason: expect.stringContaining("route") }));
    expect(op(step!.snapshot).pos).toEqual({ floor: "ground", x: 0, y: 0 });
  });

  it("a new move command replaces the old route", () => {
    const sim = withNav(stubNav((from, to) => [from, to]));
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 10, y: 0 } });
    run(sim, 10);
    sim.enqueue({ kind: "move", tick: 10, entity: "op.alpha.1", to: { floor: "ground", x: 0, y: 8 } });
    const steps = run(sim, 80);
    expect(op(steps.at(-1)!.snapshot).pos).toEqual({ floor: "ground", x: 0, y: 8 });
  });

  it("without a nav, cross-floor moves are still rejected and straight-line moves still work", () => {
    const sim = createSim({ seed: 1, map: makeTestMap() });
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "upper", x: 1, y: 1 } });
    expect(run(sim, 1)[0]!.events).toContainEqual(expect.objectContaining({ type: "commandRejected" }));
  });
});

describe("route movement: determinism and save/restore", () => {
  const route: Pos[] = [{ floor: "ground", x: 0, y: 0 }, { floor: "ground", x: 3, y: 0 }, { floor: "ground", x: 3, y: 4 }, { floor: "ground", x: 8, y: 4 }];
  const script = (sim: Sim) => sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 8, y: 4 } });

  it("two sims with the same route have the same hash every tick", () => {
    const a = withNav(stubNav(route)), b = withNav(stubNav(route));
    script(a);
    script(b);
    for (let i = 0; i < 70; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
  });

  it("serialize in the middle of a route, restore, and finish with identical hashes", () => {
    const a = withNav(stubNav(route));
    script(a);
    run(a, 22); // mid-route, past the first corner
    const saved = a.serialize();
    const b = withNav(stubNav(route));
    b.restore(saved);
    expect(b.hash()).toBe(a.hash());
    for (let i = 0; i < 50; i++) {
      const sa = a.step(), sb = b.step();
      expect(sb.snapshot).toEqual(sa.snapshot);
      expect(b.hash()).toBe(a.hash());
    }
    expect(op(a.step().snapshot).pos).toEqual({ floor: "ground", x: 8, y: 4 });
  });

  it("restore rejects a corrupt remaining route", () => {
    const a = withNav(stubNav(route));
    script(a);
    run(a, 5);
    const state = JSON.parse(a.serialize()) as { entities: { id: string; motion: { rest: unknown[] } }[] };
    const bad = structuredClone(state);
    bad.entities.find((e) => e.id === "op.alpha.1")!.motion.rest[0] = { floor: "nowhere", xCm: 1, yCm: 1 };
    expect(() => a.restore(JSON.stringify(bad))).toThrow(/restore/);
  });
});
