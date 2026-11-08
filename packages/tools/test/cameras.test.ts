import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createKnowledge, createNav, createSim } from "@war-room/sim";
import type { Nav, Sim } from "@war-room/sim";

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const map = MapFile.parse(JSON.parse(file("../../content/maps/testbed.json").toString("utf8")));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(file("../../content/generated/testbed.navmesh.bin")), map });
});

interface Saved {
  minds?: { id: string; mode: string; relay?: { due: number; camera?: boolean } }[];
  entities: { id: string; pos: { floor: string; xCm: number; yCm: number } }[];
}
const saved = (s: Sim): Saved => JSON.parse(s.serialize()) as Saved;
const modes = (s: Sim): Record<string, string> => Object.fromEntries(["def.test.1", "def.test.2", "def.test.3"].map((id) => [id, saved(s).minds?.find((m) => m.id === id)?.mode ?? "routine"]));
const run = (s: Sim, n: number): void => {
  for (let i = 0; i < n; i++) s.step();
};

/**
 * The testbed with op.alpha.1 standing in the north-east corner of the hall, where the hall camera (23, 7) sees him
 * but no defender does (def.test.1 faces south, and he is beyond its 5 m side reach). He is placed there directly so
 * he makes no footsteps. `before` can change devices first.
 */
function withOperatorInHall(before: (s: Sim) => void = () => {}): Sim {
  const base = createSim({ seed: 1, map, nav });
  const state = saved(base);
  state.entities.find((e) => e.id === "op.alpha.1")!.pos = { floor: "ground", xCm: 2350, yCm: 1150 };
  const s = createSim({ seed: 1, map, nav });
  s.restore(JSON.stringify(state));
  s.enqueue({ kind: "setShutter", tick: 0, windowId: "win.t.hall.s", state: "closed" });
  before(s);
  return s;
}

describe("cameras", () => {
  it("send every defender to look, after a delay, when a working camera sees an operator", () => {
    const s = withOperatorInHall();
    run(s, 10);
    expect(modes(s)).toEqual({ "def.test.1": "routine", "def.test.2": "routine", "def.test.3": "routine" }); // report still on its way
    expect(saved(s).minds?.some((m) => m.relay?.camera === true)).toBe(true);
    // The report sends each of them to look (suspicious first). What happens once one of them gets there and sees him is another matter.
    const first: Record<string, string> = {};
    for (let i = 0; i < 40; i++) {
      s.step();
      for (const [id, mode] of Object.entries(modes(s))) if (mode !== "routine" && first[id] === undefined) first[id] = mode;
    }
    expect(first).toEqual({ "def.test.1": "suspicious", "def.test.2": "suspicious", "def.test.3": "suspicious" });
  });

  it("do not downgrade a defender's own radio call: a sighting by one defender still alerts the others", () => {
    const base = createSim({ seed: 1, map, nav });
    const state = saved(base);
    state.entities.find((e) => e.id === "op.alpha.1")!.pos = { floor: "ground", xCm: 2350, yCm: 1150 }; // seen by the camera only
    state.entities.find((e) => e.id === "op.alpha.2")!.pos = { floor: "ground", xCm: 1800, yCm: 700 }; // right in front of def.test.1, and in camera view too
    const s = createSim({ seed: 1, map, nav });
    s.restore(JSON.stringify(state));
    s.enqueue({ kind: "setShutter", tick: 0, windowId: "win.t.hall.s", state: "closed" });
    // (The gunfire that follows also sends them to look, so they may be suspicious first; the point is that the
    // radio call is not lost behind the camera report: all three end up alerted well within the radio delay of the call.)
    run(s, 45);
    // (def.test.1, who made the sighting, is point-blank to an operator and may well be dead by now.)
    expect(modes(s)["def.test.2"]).toBe("alerted");
    expect(modes(s)["def.test.3"]).toBe("alerted");
  });

  it("see nothing when the camera is off or looped, or when the hub is down", () => {
    for (const [device, state] of [["m.smart.camera.hall", "off"], ["m.smart.camera.hall", "looped"], ["m.smart.hub", "off"]] as const) {
      const s = withOperatorInHall((sim) => sim.enqueue({ kind: "setDevice", tick: 0, deviceId: device, state }));
      run(s, 40);
      expect(saved(s).minds).toBeUndefined();
    }
  });

  it("only watch the rooms they cover", () => {
    const base = createSim({ seed: 1, map, nav });
    const state = saved(base);
    state.entities.find((e) => e.id === "op.alpha.1")!.pos = { floor: "ground", xCm: 1000, yCm: 900 }; // in the lobby, not the hall
    const s = createSim({ seed: 1, map, nav });
    s.restore(JSON.stringify(state));
    run(s, 40);
    expect(saved(s).minds?.some((m) => m.relay?.camera === true)).not.toBe(true);
    expect(Object.values(modes(s))).not.toContain("suspicious");
  });

  describe("feed events (what a tapped camera would show the President)", () => {
    /** The testbed with def.test.1 standing in the hall camera's view and the operators elsewhere. */
    function withDefenderInHall(before: (s: Sim) => void = () => {}): Sim {
      const state = saved(createSim({ seed: 1, map, nav }));
      state.entities.find((e) => e.id === "def.test.1")!.pos = { floor: "ground", xCm: 2350, yCm: 1150 };
      const s = createSim({ seed: 1, map, nav });
      s.restore(JSON.stringify(state));
      before(s);
      return s;
    }
    const cameraEvents = (s: Sim, ticks: number) => {
      const out: { device: string; target: string }[] = [];
      for (let i = 0; i < ticks; i++) for (const ev of s.step().events) if (ev.type === "camera") out.push({ device: ev.device, target: ev.target });
      return out;
    };

    it("emit a camera event naming the camera and a defender in its view, repeating while he stays", () => {
      const events = cameraEvents(withDefenderInHall(), 12);
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.device === "m.smart.camera.hall" && e.target === "def.test.1")).toBe(true);
    });

    it("never name an operator (the player already knows where they are), even one the camera does see", () => {
      const s = withOperatorInHall();
      const events = cameraEvents(s, 12);
      expect(events.filter((e) => e.target.startsWith("op."))).toEqual([]);
      expect(saved(s).minds?.some((m) => m.relay?.camera === true)).toBe(true); // ...he was seen: the guards' report is unchanged
    });

    it("go dark when the camera is off or looped, or the hub is down", () => {
      for (const [device, state] of [["m.smart.camera.hall", "off"], ["m.smart.camera.hall", "looped"], ["m.smart.hub", "off"]] as const) {
        const s = withDefenderInHall((sim) => sim.enqueue({ kind: "setDevice", tick: 0, deviceId: device, state }));
        expect(cameraEvents(s, 12), `${device} ${state}`).toEqual([]);
      }
    });

    /** Step a sim, feeding an operator-side knowledge every tick; `tapAt` taps the network at that tick (never when undefined). */
    function watch(s: Sim, ticks: number, tapAt?: number) {
      const k = createKnowledge(map, "operator");
      for (let i = 0; i < ticks; i++) {
        if (i === tapAt) k.tapCameras();
        const { snapshot, events } = s.step();
        k.update(snapshot, events);
      }
      return k;
    }
    const HALL = "m.smart.camera.hall";

    it("teach the operators nothing until the network is tapped", () => {
      const k = watch(withDefenderInHall(), 12);
      expect(k.cameraTapped()).toBe(false);
      expect(k.cameras()).toEqual([]);
      expect(k.unit("def.test.1")).toBeUndefined();
    });

    it("once tapped, list every camera, what the working ones see, and show the defender as a live contact", () => {
      const k = watch(withDefenderInHall(), 12, 0);
      expect(k.cameraTapped()).toBe(true);
      const hall = k.cameras().find((c) => c.id === HALL)!;
      expect(hall).toMatchObject({ live: true, sees: ["def.test.1"] });
      expect(k.cameras().map((c) => c.id)).toEqual(k.cameras().map((c) => c.id).sort());
      expect(k.unit("def.test.1")).toMatchObject({ live: true, own: false, side: "defender" });
      // Tapping later starts the knowledge from then on: nothing before the tap is remembered.
      const late = watch(withDefenderInHall(), 12, 11);
      expect(late.cameras().find((c) => c.id === HALL)!.sees).toEqual(["def.test.1"]);
    });

    it("show a camera as dark with nothing in it when it is off, looped or the hub is down", () => {
      for (const [device, state] of [[HALL, "off"], [HALL, "looped"], ["m.smart.hub", "off"]] as const) {
        const k = watch(withDefenderInHall((sim) => sim.enqueue({ kind: "setDevice", tick: 0, deviceId: device, state })), 12, 0);
        const hall = k.cameras().find((c) => c.id === HALL)!;
        expect(hall, `${device} ${state}`).toMatchObject({ live: false, sees: [] });
      }
    });

    it("stop listing a unit once it has left view, but remember where it was", () => {
      const s = withDefenderInHall();
      const k = watch(s, 6, 0);
      expect(k.cameras().find((c) => c.id === HALL)!.sees).toEqual(["def.test.1"]);
      s.enqueue({ kind: "setDevice", tick: 6, deviceId: HALL, state: "off" });
      for (let i = 0; i < 4; i++) {
        const { snapshot, events } = s.step();
        k.update(snapshot, events);
      }
      expect(k.cameras().find((c) => c.id === HALL)).toMatchObject({ live: false, sees: [] });
      expect(k.unit("def.test.1")).toBeDefined(); // last known position stays
    });

    it("are deterministic: the same run twice gives the same events", () => {
      expect(cameraEvents(withDefenderInHall(), 30)).toEqual(cameraEvents(withDefenderInHall(), 30));
    });
  });

  it("is deterministic, restores exactly with a camera report pending, and refuses a malformed one", () => {
    const a = withOperatorInHall(), b = withOperatorInHall();
    run(a, 12);
    run(b, 12);
    expect(a.hash()).toBe(b.hash());
    const copy = createSim({ seed: 9, map, nav });
    copy.restore(a.serialize());
    expect(copy.hash()).toBe(a.hash());
    run(copy, 150);
    run(a, 150);
    expect(copy.hash()).toBe(a.hash());

    const s = withOperatorInHall();
    run(s, 12);
    const bad = JSON.parse(s.serialize()) as { minds: { relay?: { camera?: unknown } }[] };
    bad.minds.find((m) => m.relay)!.relay!.camera = "yes";
    expect(() => createSim({ seed: 1, map, nav }).restore(JSON.stringify(bad))).toThrow();
  });
});
