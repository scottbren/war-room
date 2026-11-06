import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav, createSim } from "@war-room/sim";
import type { Nav, Pos, Sim, SimEvent } from "@war-room/sim";

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const baseMap = MapFile.parse(JSON.parse(file("../../content/maps/testbed.json").toString("utf8")));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(file("../../content/generated/testbed.navmesh.bin")), map: baseMap });
});

const yard = (x: number, y: number): Pos => ({ floor: "grounds", x, y }) as Pos;

/** The testbed with def.test.1 turned to face `deg` (the shipped map has it facing south, toward the window). */
function mapFacing(deg: number): MapFile {
  const m = structuredClone(baseMap);
  const marker = m.markers.find((x) => x.id === "m.spawn.def1")!;
  marker.tags = marker.tags.map((t) => (t.startsWith("facing:") ? `facing:${deg}` : t));
  return MapFile.parse(m);
}

/**
 * Which "observer>target" contacts happen when the operator stands still at (x, y) in the yard. He is placed there
 * directly, so he makes no footsteps that could turn the defender's head first.
 */
function contacts(map: MapFile, x: number, y: number): Set<string> {
  const placed = JSON.parse(createSim({ seed: 1, map, nav }).serialize()) as { entities: { id: string; pos: { floor: string; xCm: number; yCm: number } }[] };
  const op = placed.entities.find((e) => e.id === "op.alpha.1")!;
  op.pos = { floor: "grounds", xCm: Math.round(x * 100), yCm: Math.round(y * 100) };
  const s = createSim({ seed: 1, map, nav });
  s.restore(JSON.stringify(placed));
  const out = new Set<string>();
  for (let i = 0; i < 60; i++) {
    for (const e of s.step().events as SimEvent[]) if (e.type === "contact") out.add(`${e.observer}>${e.target}`);
  }
  return out;
}

describe("facing and field of view", () => {
  it("reads a spawn marker's facing tag, and defaults to north", () => {
    const e = createSim({ seed: 1, map: baseMap, nav }).step().snapshot.entities;
    const facing = (id: string): number => e.find((x) => x.id === id)!.facing;
    expect(facing("def.test.1")).toBe(180);
    expect(facing("def.test.3")).toBe(90);
    expect(facing("op.alpha.1")).toBe(0);
  });

  it("rejects a malformed facing tag instead of ignoring it", () => {
    const m = structuredClone(baseMap);
    const marker = m.markers.find((x) => x.id === "m.spawn.def1")!;
    marker.tags = marker.tags.map((t) => (t.startsWith("facing:") ? "facing:north" : t));
    expect(() => createSim({ seed: 1, map: MapFile.parse(m), nav })).toThrow(/bad facing tag/);
  });

  it("a defender sees an operator in front of it, but not one behind it, while the operator still sees the defender", () => {
    const ahead = contacts(mapFacing(180), 18.5, 2); // window is south of the defender
    expect(ahead.has("def.test.1>op.alpha.1")).toBe(true);
    const away = contacts(mapFacing(0), 18.5, 2); // defender faces north, back to the window
    expect(away.has("def.test.1>op.alpha.1")).toBe(false);
    expect(away.has("op.alpha.1>def.test.1")).toBe(true); // operators see all around
  });

  it("sees only a short way out of the corner of its eye, and a little less behind", () => {
    const side = mapFacing(90); // the operator is 90 degrees to its right
    expect(contacts(side, 18.5, 2).has("def.test.1>op.alpha.1")).toBe(false); // 6.5 m: too far for peripheral vision (5 m)
    expect(contacts(side, 18.5, 4).has("def.test.1>op.alpha.1")).toBe(true); // 4.5 m: inside it
    const behind = mapFacing(0);
    expect(contacts(behind, 18.5, 4).has("def.test.1>op.alpha.1")).toBe(false); // 4.5 m behind: beyond the 2 m rear reach
  });

  it("a defender turns toward a sound it heard", () => {
    const s = createSim({ seed: 1, map: baseMap, nav });
    s.enqueue({ kind: "setShutter", tick: 0, windowId: "win.t.hall.s", state: "closed" });
    s.enqueue({ kind: "setDoor", tick: 1, doorId: "d.t.hall-vault", state: "open" }); // east-south-east of def.test.2 at (16.5, 14)
    let facing = 180;
    for (let i = 0; i < 4; i++) facing = s.step().snapshot.entities.find((x) => x.id === "def.test.2")!.facing;
    expect(facing).not.toBe(180);
    expect(Math.abs(facing - 110)).toBeLessThan(45);
  });

  it("is deterministic through a save", () => {
    const make = (): Sim => {
      const s = createSim({ seed: 1, map: baseMap, nav });
      s.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: yard(18.5, 2) });
      return s;
    };
    const a = make(), b = make();
    for (let i = 0; i < 100; i++) { a.step(); b.step(); }
    expect(a.hash()).toBe(b.hash());
    const copy = createSim({ seed: 3, map: baseMap, nav });
    copy.restore(a.serialize());
    for (let i = 0; i < 60; i++) { copy.step(); a.step(); }
    expect(copy.hash()).toBe(a.hash());
  });
});
