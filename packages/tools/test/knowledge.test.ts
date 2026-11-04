import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { LIVE_TICKS, createKnowledge, createSim } from "@war-room/sim";
import type { Knowledge, Pos, Sim } from "@war-room/sim";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/testbed.json", import.meta.url)), "utf8")));
const mission = JSON.parse(readFileSync(fileURLToPath(new URL("../../content/missions/testbed.json", import.meta.url)), "utf8"));
const yard = (x: number, y: number): Pos => ({ floor: "grounds", x, y }) as Pos;

/** A sim and the knowledge each side builds from it, stepped together. */
function rig(withMission = false) {
  const sim: Sim = createSim({ seed: 1, map, ...(withMission ? { mission } : {}) });
  const operators = createKnowledge(map, "operator");
  const defenders = createKnowledge(map, "defender");
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      const { snapshot, events } = sim.step();
      operators.update(snapshot, events);
      defenders.update(snapshot, events);
    }
  };
  return { sim, operators, defenders, step };
}
const ids = (k: Knowledge): string[] => k.units().map((u) => u.id);

describe("knowledge: what each side knows", () => {
  it("at the start an operator knows its own units and nothing of the defenders, family or principal", () => {
    const { operators, defenders, step } = rig(true);
    step(30);
    expect(ids(operators)).toEqual(["op.alpha.1", "op.alpha.2"]);
    expect(operators.units().every((u) => u.own && u.live)).toBe(true);
    expect(ids(defenders)).toEqual(["def.test.1", "def.test.2", "def.test.3"]);
  });

  it("learns a defender through an open window, loses it as a live contact when the shutter closes, and keeps the last-known spot", () => {
    const { sim, operators, defenders, step } = rig();
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: yard(18.5, 2) });
    step(70);
    const seen = operators.unit("def.test.1")!;
    expect(seen).toMatchObject({ side: "defender", floor: "ground", live: true, own: false, x: 18, y: 8.5 });
    expect(defenders.unit("op.alpha.1")).toMatchObject({ live: true, own: false });
    expect(ids(operators)).not.toContain("def.test.2");

    sim.enqueue({ kind: "setShutter", tick: 70, windowId: "win.t.hall.s", state: "closed" });
    step(LIVE_TICKS + 4);
    const stale = operators.unit("def.test.1")!;
    expect(stale.live).toBe(false);
    expect(stale).toMatchObject({ x: 18, y: 8.5 }); // where it was; it may have moved since
    expect(stale.lastSeenTick).toBeLessThan(sim.step().snapshot.tick - LIVE_TICKS);
  });

  it("never reports a unit it has not seen, whatever the snapshot holds", () => {
    const { operators, step } = rig(true);
    step(100);
    for (const id of ["principal", "family.wife", "def.test.2", "def.test.3"]) expect(operators.unit(id), id).toBeUndefined();
  });

  it("holds a plan with every door but the hidden one, until it is found", () => {
    const { operators } = rig();
    expect(operators.knownDoorIds()).toEqual(["d.t.front", "d.t.hall-study", "d.t.hall-vault", "d.t.landing-bedroom", "d.t.lobby-hall", "d.t.lobby-office"]);
    expect(operators.isDoorKnown("d.t.study-vault")).toBe(false);
    operators.revealDoor("d.t.study-vault");
    expect(operators.isDoorKnown("d.t.study-vault")).toBe(true);
    expect(operators.revealedDoorIds()).toEqual(["d.t.study-vault"]);
    expect(operators.knownDoorIds()).toContain("d.t.study-vault");
    expect(() => operators.revealDoor("d.nowhere")).toThrow(/unknown door/);
  });

  it("is deterministic: two identical runs build identical knowledge", () => {
    const run = () => {
      const r = rig(true);
      r.sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: yard(18.5, 2) });
      r.step(80);
      return r.operators.units();
    };
    expect(run()).toEqual(run());
  });
});
