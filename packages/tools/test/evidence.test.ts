import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav, createSim } from "@war-room/sim";
import type { Nav, Sim } from "@war-room/sim";

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const map = MapFile.parse(JSON.parse(file("../../content/maps/testbed.json").toString("utf8")));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(file("../../content/generated/testbed.navmesh.bin")), map });
});

const sim = (): Sim => createSim({ seed: 1, map, nav });
const run = (s: Sim, n: number): void => {
  for (let i = 0; i < n; i++) s.step();
};
interface Saved { noticed?: { k: string; t: number }[]; minds?: { id: string; mode: string }[]; entities: { id: string; state: string; health: number; motion?: unknown; pos: { floor: string; xCm: number; yCm: number } }[] }
const saved = (s: Sim): Saved => JSON.parse(s.serialize()) as Saved;
const noticed = (s: Sim): string[] => (saved(s).noticed ?? []).map((n) => n.k);
const modeOf = (s: Sim, id: string): string => saved(s).minds?.find((m) => m.id === id)?.mode ?? "routine";
/** Shutter closed so nobody can see outside or be seen from it; the tests are about what happens inside. */
const shut = (s: Sim): void => s.enqueue({ kind: "setShutter", tick: 0, windowId: "win.t.hall.s", state: "closed" });

describe("evidence", () => {
  it("notices nothing on an untouched map", () => {
    const s = sim();
    shut(s);
    run(s, 60);
    expect(saved(s).noticed).toBeUndefined();
  });

  it("a defender who can see a door that has been opened notices it once; one who cannot does not", () => {
    const s = sim();
    shut(s);
    s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-study", state: "open" }); // at (16, 12); def.test.1 faces it from the hall
    run(s, 15);
    expect(noticed(s)).toContain("def.test.1>door:d.t.hall-study");
    expect(noticed(s).some((k) => k.startsWith("def.test.3>"))).toBe(false); // in the hedge outside
    const t = saved(s).noticed!.find((n) => n.k === "def.test.1>door:d.t.hall-study")!.t;
    run(s, 60);
    expect(saved(s).noticed!.find((n) => n.k === "def.test.1>door:d.t.hall-study")!.t).toBe(t); // not noticed again
  });

  it("forgets a door that is put back, so opening it again is noticed again", () => {
    const s = sim();
    shut(s);
    s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-study", state: "open" });
    s.enqueue({ kind: "setDoor", tick: 20, doorId: "d.t.hall-study", state: "closed" }); // its start state
    run(s, 25);
    expect(noticed(s)).not.toContain("def.test.1>door:d.t.hall-study");
    s.enqueue({ kind: "setDoor", tick: 30, doorId: "d.t.hall-study", state: "open" });
    run(s, 20);
    expect(noticed(s)).toContain("def.test.1>door:d.t.hall-study");
  });

  it("a defender who sees a downed unit is alerted to it, and tells the others", () => {
    const s = sim();
    shut(s);
    const state = saved(s);
    const victim = state.entities.find((e) => e.id === "def.test.2")!;
    victim.state = "down";
    victim.health = 0;
    victim.pos = { floor: "ground", xCm: 1800, yCm: 700 }; // in the hall, south-east of def.test.1 and in front of it
    const copy = sim();
    copy.restore(JSON.stringify(state));
    run(copy, 10);
    expect(noticed(copy)).toContain("def.test.1>body:def.test.2");
    expect(modeOf(copy, "def.test.1")).toBe("alerted");
    run(copy, 60);
    expect(modeOf(copy, "def.test.3")).toBe("alerted"); // the radio report arrived
  });

  it("also notices a door that was closed, not only one that was opened", () => {
    const s = sim();
    shut(s);
    s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.lobby-hall", state: "closed" }); // starts open; 4 m to def.test.1's right
    run(s, 15);
    expect(noticed(s)).toContain("def.test.1>door:d.t.lobby-hall");
  });

  it("drops what a defender noticed when the last defender is gone", () => {
    const s = sim();
    shut(s);
    s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-study", state: "open" });
    run(s, 15);
    const state = saved(s);
    for (const e of state.entities) if (e.id.startsWith("def.")) { e.state = "down"; e.health = 0; delete e.motion; }
    const copy = sim();
    expect(() => copy.restore(JSON.stringify(state))).toThrow(); // a downed defender cannot have noticed anything
    delete state.noticed;
    delete state.minds;
    copy.restore(JSON.stringify(state));
    run(copy, 5);
    expect(saved(copy).noticed).toBeUndefined();
  });

  it("is deterministic and restores exactly with evidence noticed; a bad saved record is refused", () => {
    const make = (): Sim => {
      const s = sim();
      shut(s);
      s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-study", state: "open" });
      return s;
    };
    const a = make(), b = make();
    run(a, 40);
    run(b, 40);
    expect(a.hash()).toBe(b.hash());
    const copy = sim();
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    run(copy, 100);
    run(a, 100);
    expect(copy.hash()).toBe(a.hash());

    const good = saved(a) as Saved & Record<string, unknown>;
    const attempt = (k: string, t = 1): void => {
      const bad = structuredClone(good);
      bad.noticed = [{ k, t }];
      sim().restore(JSON.stringify(bad));
    };
    expect(() => attempt("op.alpha.1>door:d.t.hall-study")).toThrow(); // operators do not notice
    expect(() => attempt("def.test.1>door:d.nope")).toThrow();
    expect(() => attempt("def.test.1>body:nobody")).toThrow();
    expect(() => attempt("def.test.1>door:d.t.hall-study", 99999)).toThrow();
    expect(() => attempt("def.test.1>door:d.t.hall-study")).not.toThrow();
  });
});
