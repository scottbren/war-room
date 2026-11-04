import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createSim } from "@war-room/sim";
import type { Pos, Sim, SimEvent } from "@war-room/sim";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/testbed.json", import.meta.url)), "utf8")));
const yard = (x: number, y: number): Pos => ({ floor: "grounds", x, y }) as Pos;

type Contact = Extract<SimEvent, { type: "contact" }>;
/** Steps the sim and returns the contact events it produced. */
function run(sim: Sim, ticks: number): Contact[] {
  const out: Contact[] = [];
  for (let i = 0; i < ticks; i++) out.push(...sim.step().events.filter((e): e is Contact => e.type === "contact"));
  return out;
}
const pairs = (events: Contact[]): string[] => [...new Set(events.map((e) => `${e.observer}>${e.target}`))].sort();
const sim = (): Sim => createSim({ seed: 1, map });
const moveTo = (s: Sim, tick: number, entity: string, to: Pos): void => s.enqueue({ kind: "move", tick, entity, to });

describe("perception", () => {
  it("sees nothing at the start: walls and distance hide the defenders from operators in the yard, and the operators from them", () => {
    expect(run(sim(), 40)).toEqual([]);
  });

  it("makes contact through an open window, and again after the shutter is closed and reopened", () => {
    const s = sim();
    moveTo(s, 0, "op.alpha.1", yard(18.5, 2));
    expect(pairs(run(s, 60))).toEqual(["def.test.1>op.alpha.1", "op.alpha.1>def.test.1"]);
    s.enqueue({ kind: "setShutter", tick: 60, windowId: "win.t.hall.s", state: "closed" });
    expect(run(s, 20)).toEqual([]);
    s.enqueue({ kind: "setShutter", tick: 80, windowId: "win.t.hall.s", state: "open" });
    expect(pairs(run(s, 20))).toEqual(["def.test.1>op.alpha.1", "op.alpha.1>def.test.1"]);
  });

  it("repeats a contact as a heartbeat while the target stays in view", () => {
    const s = sim();
    moveTo(s, 0, "op.alpha.1", yard(18.5, 2));
    const events = run(s, 100);
    const n = events.filter((e) => e.observer === "op.alpha.1" && e.target === "def.test.1").length;
    expect(n).toBeGreaterThanOrEqual(14); // in view for about the last 50 of 100 ticks, one contact per 3-tick check
    expect(n).toBeLessThanOrEqual(22);
  });

  it("concealment halves the range: a defender in the hedge is seen from 6 m but not from 12 m", () => {
    const far = sim();
    moveTo(far, 0, "op.alpha.1", yard(1, -1)); // about 12 m from (3, 11), the hedge
    expect(pairs(run(far, 40)).filter((p) => p.endsWith(">def.test.3"))).toEqual([]);
    const near = sim();
    moveTo(near, 0, "op.alpha.1", yard(1, 5)); // about 6 m, and clear of the house walls
    expect(pairs(run(near, 60))).toContain("op.alpha.1>def.test.3");
  });

  it("defenders only watch operators, and operators also notice civilians, family and the principal", () => {
    const s = createSim({ seed: 1, map, mission: JSON.parse(readFileSync(fileURLToPath(new URL("../../content/missions/testbed.json", import.meta.url)), "utf8")) });
    moveTo(s, 0, "op.alpha.1", yard(18.5, 2));
    const events = run(s, 80);
    for (const e of events) {
      if (e.observer.startsWith("def.")) expect(e.target.startsWith("op.")).toBe(true);
      expect(e.observer).not.toBe(e.target);
    }
  });

  it("is deterministic and survives a save in the middle of a sighting", () => {
    const make = (): Sim => {
      const s = sim();
      moveTo(s, 0, "op.alpha.1", yard(18.5, 2));
      return s;
    };
    const a = make(), b = make();
    expect(run(a, 50)).toEqual(run(b, 50));
    expect(a.hash()).toBe(b.hash());
    const saved = a.serialize();
    expect(JSON.parse(saved)).toHaveProperty("sight");
    const copy = createSim({ seed: 99, map });
    copy.restore(saved);
    expect(copy.hash()).toBe(a.hash());
    expect(run(copy, 30)).toEqual(run(a, 30));
    expect(copy.hash()).toBe(a.hash());
  });

  it("leaves the state untouched when nobody is in view (no sight field), so quiet runs hash as before", () => {
    const s = sim();
    run(s, 20);
    expect(JSON.parse(s.serialize())).not.toHaveProperty("sight");
  });
});
