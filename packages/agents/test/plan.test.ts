import { describe, expect, it } from "vitest";
import { createKnowledge } from "@war-room/sim";
import type { SimEvent } from "@war-room/sim";
import { extractJson, planContext, validatePlan } from "../src/plan";
import type { PlanContext } from "../src/plan";
import { HALL, LOBBY, base, map, snap } from "./helpers";

const ctx: PlanContext = {
  map,
  teams: ["alpha"],
  knownEntities: new Set(["op.alpha.1", "def.test.1"]),
  downedOwn: new Set(["op.alpha.2"]),
  maxRoe: "return",
};
const plan = (...tasks: unknown[]) => ({ id: "p1", issuedBy: "reyes", intent: "Take the hall.", tasks });
const task = (over: Record<string, unknown> = {}) => ({ team: "alpha", action: "move", target: { roomId: "t.hall" }, ...over });
const reasons = (raw: unknown, c = ctx): string[] => {
  const r = validatePlan(raw, c);
  return r.ok ? [] : r.reasons;
};

describe("validatePlan: shape", () => {
  it("accepts a legal plan and returns it as a Plan", () => {
    const r = validatePlan(plan(task(), task({ action: "clear", target: { roomId: "t.office" }, rules: ["roe:return"] })), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.tasks).toHaveLength(2);
  });

  it("rejects things that are not plans, without throwing", () => {
    for (const bad of [null, undefined, 7, "plan", [], {}, { id: "x" }]) expect(reasons(bad).length, String(bad)).toBeGreaterThan(0);
  });

  it("rejects an unknown action, extra fields, no tasks, too many tasks, and a target with none or two of its fields", () => {
    expect(reasons(plan(task({ action: "snipe" })))[0]).toContain("tasks.0.action");
    expect(reasons({ ...plan(task()), extra: 1 }).length).toBeGreaterThan(0);
    expect(reasons(plan()).length).toBeGreaterThan(0);
    expect(reasons(plan(...Array.from({ length: 13 }, () => task()))).length).toBeGreaterThan(0);
    expect(reasons(plan(task({ target: {} })))[0]).toContain("exactly one");
    expect(reasons(plan(task({ target: { roomId: "t.hall", entity: "def.test.1" } })))[0]).toContain("exactly one");
  });

  it("rejects an overlong intent and non-finite coordinates", () => {
    expect(reasons({ ...plan(task()), intent: "x".repeat(301) }).length).toBeGreaterThan(0);
    expect(reasons(plan(task({ target: { at: { floor: "ground", x: Number.NaN, y: 1 } } }))).length).toBeGreaterThan(0);
  });

  it("limits how many reasons it reports", () => {
    const bad = plan(...Array.from({ length: 10 }, () => task({ team: "ghost" })));
    expect(reasons(bad).length).toBeLessThanOrEqual(5);
  });
});

describe("validatePlan: legality", () => {
  it("rejects a team that is not on the ground, naming the teams that are", () => {
    expect(reasons(plan(task({ team: "bravo" })))).toEqual(['task 1 (bravo move): no team called "bravo" (teams: alpha)']);
  });

  it("rejects a room that does not exist, and an open void", () => {
    expect(reasons(plan(task({ target: { roomId: "t.nowhere" } })))[0]).toContain('room "t.nowhere" does not exist');
    const voided = { ...map, floors: map.floors.map((f) => ({ ...f, rooms: f.rooms.map((r) => (r.id === "t.hall" ? { ...r, tags: [...r.tags, "void"] } : r)) })) };
    expect(reasons(plan(task()), { ...ctx, map: voided })[0]).toContain("open void");
  });

  it("checks points: the floor must exist and the point must be on the map", () => {
    expect(validatePlan(plan(task({ target: { at: { floor: "ground", x: 10, y: 9 } } })), ctx).ok).toBe(true);
    expect(reasons(plan(task({ target: { at: { floor: "roof", x: 10, y: 9 } } })))[0]).toContain('no floor "roof"');
    expect(reasons(plan(task({ target: { at: { floor: "ground", x: 999, y: 9 } } })))[0]).toContain("off the map");
  });

  it("only lets an action target what makes sense for it", () => {
    expect(reasons(plan(task({ action: "clear", target: { at: { floor: "ground", x: 10, y: 9 } } })))[0]).toContain("cannot target a point");
    expect(reasons(plan(task({ action: "search", target: { entity: "def.test.1" } })))[0]).toContain("cannot target a unit");
    expect(reasons(plan(task({ action: "evacuate", target: { roomId: "t.hall" } })))[0]).toContain("cannot target a room");
  });

  it("only lets the player target units the operators have actually seen (truth stays hidden)", () => {
    expect(validatePlan(plan(task({ target: { entity: "def.test.1" } })), ctx).ok).toBe(true);
    expect(reasons(plan(task({ target: { entity: "def.test.9" } })))[0]).toContain('nobody has seen "def.test.9"');
  });

  it("lets evacuate name only one of our downed units", () => {
    expect(validatePlan(plan(task({ action: "evacuate", target: { entity: "op.alpha.2" } })), ctx).ok).toBe(true);
    expect(reasons(plan(task({ action: "evacuate", target: { entity: "op.alpha.1" } })))[0]).toContain("not one of our downed units");
  });

  it("knows only the rules of engagement, and refuses one looser than the player allows", () => {
    expect(validatePlan(plan(task({ rules: ["roe:hold"] })), ctx).ok).toBe(true);
    expect(validatePlan(plan(task({ rules: ["roe:return"] })), ctx).ok).toBe(true);
    expect(reasons(plan(task({ rules: ["roe:free"] })))[0]).toContain("looser than the rules of engagement you set (at most roe:return)");
    expect(reasons(plan(task({ rules: ["kill them all"] })))[0]).toContain('unknown rule "kill them all"');
    expect(validatePlan(plan(task({ rules: ["roe:free"] })), { ...ctx, maxRoe: "free" }).ok).toBe(true);
  });

  it("reports every problem, each naming its task", () => {
    const r = reasons(plan(task({ team: "bravo" }), task({ target: { roomId: "t.nowhere" } })));
    expect(r.some((x) => x.startsWith("task 1"))).toBe(true);
    expect(r.some((x) => x.startsWith("task 2"))).toBe(true);
  });
});

describe("planContext", () => {
  it("is built from knowledge only: our teams, the units seen, and our downed", () => {
    const k = createKnowledge(map, "operator");
    const events: SimEvent[] = [{ ...base(2), type: "contact", observer: "op.alpha.1", target: "def.test.1" }];
    k.update(snap(2, [
      { id: "op.alpha.1", side: "operator", at: HALL },
      { id: "op.alpha.2", side: "operator", at: HALL, state: "down" },
      { id: "op.bravo.1", side: "operator", at: HALL },
      { id: "def.test.1", side: "defender", at: LOBBY },
      { id: "def.test.2", side: "defender", at: LOBBY }, // never seen
    ]), events);
    const c = planContext(map, k, "hold");
    expect(c.teams).toEqual(["alpha", "bravo"]);
    expect([...c.knownEntities].sort()).toEqual(["def.test.1", "op.alpha.1", "op.alpha.2", "op.bravo.1"]);
    expect([...c.downedOwn]).toEqual(["op.alpha.2"]);
    expect(c.maxRoe).toBe("hold");
  });
});

describe("extractJson", () => {
  it("reads bare JSON, fenced JSON and JSON inside a sentence", () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('Here you go: {"a":{"b":2}} Hope that helps.')).toEqual({ ok: true, value: { a: { b: 2 } } });
  });
  it("says why when there is nothing to read", () => {
    expect(extractJson("no json here")).toEqual({ ok: false, reason: "the reply contains no JSON object" });
    expect(extractJson("{not json}")).toEqual({ ok: false, reason: "the reply is not valid JSON" });
    expect(extractJson("")).toMatchObject({ ok: false });
  });
});
