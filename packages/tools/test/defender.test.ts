import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav, createSim } from "@war-room/sim";
import type { Nav, Pos, Sim } from "@war-room/sim";

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const map = MapFile.parse(JSON.parse(file("../../content/maps/testbed.json").toString("utf8")));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(file("../../content/generated/testbed.navmesh.bin")), map });
});

const yard = (x: number, y: number): Pos => ({ floor: "grounds", x, y }) as Pos;
const sim = (): Sim => createSim({ seed: 1, map, nav });

interface MindOut { id: string; mode: string; relay?: unknown }
const minds = (s: Sim): MindOut[] => (JSON.parse(s.serialize()) as { minds?: MindOut[] }).minds ?? [];
const modeOf = (s: Sim, id: string): string => minds(s).find((m) => m.id === id)?.mode ?? "routine";
const where = (s: Sim, id: string): { x: number; y: number; facing: number } => {
  const saved = JSON.parse(s.serialize()) as { entities: { id: string; pos: { xCm: number; yCm: number }; facing: number }[] };
  const e = saved.entities.find((x) => x.id === id)!;
  return { x: e.pos.xCm / 100, y: e.pos.yCm / 100, facing: e.facing };
};
const run = (s: Sim, ticks: number): void => {
  for (let i = 0; i < ticks; i++) s.step();
};
/** The operator walks to where the hall defender can see him through the window. */
const showOperator = (s: Sim): void => s.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: yard(18.5, 2) });

describe("defender behavior", () => {
  it("leaves defenders alone when nothing happens, and keeps the state free of minds", () => {
    const s = sim();
    run(s, 100);
    expect(minds(s)).toEqual([]);
    expect(where(s, "def.test.1")).toMatchObject({ x: 18, y: 8.5 });
  });

  it("sends a defender who hears a door to look, then back to its post", () => {
    const s = sim();
    s.enqueue({ kind: "setShutter", tick: 0, windowId: "win.t.hall.s", state: "closed" }); // nobody outside can be seen
    s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-vault", state: "open" });
    const post = where(s, "def.test.2");
    let farthest = 0;
    const modes = new Set<string>();
    for (let i = 0; i < 700; i++) {
      s.step();
      const p = where(s, "def.test.2");
      farthest = Math.max(farthest, Math.hypot(p.x - post.x, p.y - post.y));
      modes.add(modeOf(s, "def.test.2"));
    }
    expect(modes.has("suspicious")).toBe(true);
    expect(farthest).toBeGreaterThan(1);
    expect(modes.has("returning") || modes.has("routine")).toBe(true);
    expect(modeOf(s, "def.test.2")).toBe("routine"); // back to normal by the end
    const end = where(s, "def.test.2");
    expect(Math.hypot(end.x - post.x, end.y - post.y)).toBeLessThan(0.5);
  });

  it("turns a defender who sees an operator alert: it holds still, faces him, and the others are told after a delay", () => {
    const s = sim();
    showOperator(s);
    let firstAlert = -1;
    let others = -1;
    for (let i = 0; i < 200; i++) {
      s.step();
      if (firstAlert < 0 && modeOf(s, "def.test.1") === "alerted") firstAlert = i;
      if (others < 0 && modeOf(s, "def.test.2") === "alerted" && modeOf(s, "def.test.3") === "alerted") others = i;
    }
    expect(firstAlert).toBeGreaterThanOrEqual(0);
    expect(others).toBeGreaterThanOrEqual(firstAlert + 30); // the radio takes 3 s
    const d = where(s, "def.test.1");
    expect(d).toMatchObject({ x: 18, y: 8.5 }); // held its post
    expect(d.facing).toBeGreaterThan(90); // faces south-ish, toward the yard (0 is north, clockwise)
    expect(d.facing).toBeLessThan(270);
    expect((JSON.parse(s.serialize()) as { alert: number }).alert).toBe(0); // alert levels are not touched
  });

  it("calms down when nothing more happens: alerted, then suspicious (goes to look), then back to routine", () => {
    // Start from a defender who is already alerted, with no operator anywhere near, so that no fight interferes.
    const s0 = sim();
    run(s0, 5);
    const state = JSON.parse(s0.serialize()) as { tick: number; minds?: unknown[] };
    state.minds = [{
      id: "def.test.2",
      mode: "alerted",
      post: { floor: "ground", xCm: 1650, yCm: 1400 },
      spot: { floor: "ground", xCm: 1800, yCm: 800 },
      t: state.tick,
    }];
    const s = sim();
    s.restore(JSON.stringify(state));
    const modes: string[] = [];
    for (let i = 0; i < 700; i++) {
      s.step();
      const m = modeOf(s, "def.test.2");
      if (modes[modes.length - 1] !== m) modes.push(m);
    }
    expect(modes[0]).toBe("alerted");
    expect(modes).toEqual(["alerted", "suspicious", "returning", "routine"]);
  });

  it("never gives operators a mind, and is deterministic through a save in the middle of an alert", () => {
    const make = (): Sim => {
      const s = sim();
      showOperator(s);
      return s;
    };
    const a = make(), b = make();
    run(a, 90);
    run(b, 90);
    expect(a.hash()).toBe(b.hash());
    expect(minds(a).length).toBeGreaterThan(0);
    expect(minds(a).every((m) => m.id.startsWith("def."))).toBe(true);
    const copy = createSim({ seed: 99, map, nav });
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    run(copy, 120);
    run(a, 120);
    expect(copy.hash()).toBe(a.hash());
  });

  it("restores exactly with a radio report still on its way, and in the middle of a walk to a sound", () => {
    const radio = sim();
    showOperator(radio);
    run(radio, 60); // def.test.1 has seen the operator at about tick 47; the report reaches the others at about 77
    expect(minds(radio).some((m) => m.id === "def.test.2" && m.relay !== undefined)).toBe(true); // a report is pending
    const walk = sim();
    walk.enqueue({ kind: "setShutter", tick: 0, windowId: "win.t.hall.s", state: "closed" });
    walk.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-vault", state: "open" });
    run(walk, 12);
    expect(modeOf(walk, "def.test.2")).toBe("suspicious");
    for (const original of [radio, walk]) {
      const copy = createSim({ seed: 99, map, nav });
      copy.restore(original.serialize());
      expect(copy.hash()).toBe(original.hash());
      run(copy, 300);
      run(original, 300);
      expect(copy.hash()).toBe(original.hash());
    }
  });

  it("refuses a saved state whose mind belongs to an operator, an unknown floor or a future time", () => {
    const s = sim();
    showOperator(s);
    run(s, 90);
    const saved = JSON.parse(s.serialize()) as { minds: Record<string, unknown>[] };
    const tamper = (change: (m: Record<string, unknown>) => void): string => {
      const copy = JSON.parse(JSON.stringify(saved)) as typeof saved;
      change(copy.minds[0]!);
      return JSON.stringify(copy);
    };
    const fresh = (): Sim => createSim({ seed: 1, map, nav });
    expect(() => fresh().restore(tamper((m) => { m["id"] = "op.alpha.1"; }))).toThrow();
    expect(() => fresh().restore(tamper((m) => { m["post"] = { floor: "nowhere", xCm: 0, yCm: 0 }; }))).toThrow();
    expect(() => fresh().restore(tamper((m) => { m["t"] = 999999; }))).toThrow();
    expect(() => fresh().restore(tamper((m) => { m["mode"] = "panic"; }))).toThrow();
    expect(() => fresh().restore(tamper((m) => { m["mode"] = "routine"; delete m["relay"]; }))).toThrow();
    expect(() => fresh().restore(tamper((m) => { m["extra"] = 1; }))).toThrow();
    fresh().restore(JSON.stringify(saved)); // the untouched state is accepted
  });
});
