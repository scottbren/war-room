import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav } from "../../sim/src/nav";
import type { Nav } from "../../sim/src/nav";
import { createSim } from "../../sim/src";
import type { Pos, Sim, SimEvent } from "../../sim/src";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const baseMap = MapFile.parse(JSON.parse(read("../../content/maps/charon.json").toString("utf8")));
/** CHARON plus one operator on the helipad (operators normally arrive by insertion, which does not exist yet). */
const map: MapFile = {
  ...baseMap,
  // No defenders: these tests are about walking, and a defender who sees the walker starts a fight.
  markers: [...baseMap.markers.filter((m) => !m.tags.includes("side:defender")), { id: "m.spawn.op.test", floor: "grounds", kind: "spawn", at: { x: 48, y: 68 }, tags: ["entity:op.alpha.1", "side:operator"] }],
};

let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(read("../../content/generated/charon.navmesh.bin")), map });
});

const study = (): Pos => {
  const r = map.floors.find((f) => f.id === "ground")!.rooms.find((x) => x.id === "g.study")!.rect;
  return { floor: "ground", x: Math.round((r.min.x + r.max.x) * 50) / 100, y: Math.round((r.min.y + r.max.y) * 50) / 100 };
};
const walkable = (p: Pos): Pos => {
  for (let d = 0; d < 6; d += 0.25) {
    for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]] as const) {
      const q = { ...p, x: p.x + dx, y: p.y + dy };
      if (nav.isWalkable(q)) return q;
    }
  }
  throw new Error("no walkable point");
};

function walk(sim: Sim, to: Pos, maxTicks = 3000): { ticks: number; events: SimEvent[]; floors: string[]; last: Pos } {
  sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to });
  const events: SimEvent[] = [];
  const floors: string[] = [];
  let last: Pos;
  for (let i = 0; i < maxTicks; i++) {
    const step = sim.step();
    events.push(...step.events);
    const op = step.snapshot.entities.find((e) => e.id === "op.alpha.1")!;
    last = op.pos;
    if (floors.at(-1) !== op.pos.floor) floors.push(op.pos.floor);
    if (step.events.some((e) => e.type === "arrived" && e.entity === "op.alpha.1")) return { ticks: i + 1, events, floors, last };
  }
  throw new Error("never arrived");
}

describe("an operator walking the CHARON navmesh in the sim", () => {
  it("walks from the helipad to the study and arrives exactly on the target", () => {
    const to = walkable(study());
    const sim = createSim({ seed: 7, map, nav });
    const r = walk(sim, to);
    expect(r.last).toEqual(to);
    expect(r.floors).toEqual(["grounds", "ground"]);
    expect(r.ticks).toBeGreaterThan(150); // roughly 40 m at 2 m/s
    expect(r.ticks).toBeLessThan(400);
    expect(r.events.filter((e) => e.type === "arrived")).toHaveLength(1);
  });

  it("walks from the helipad to the panic room", () => {
    const r = map.floors.find((f) => f.id === "ground")!.rooms.find((x) => x.id === "g.panic")!.rect;
    const to = walkable({ floor: "ground", x: (r.min.x + r.max.x) / 2, y: (r.min.y + r.max.y) / 2 });
    const walked = walk(createSim({ seed: 7, map, nav }), to);
    expect(walked.last).toEqual(to);
    expect(walked.floors).toEqual(["grounds", "ground"]);
  });

  it("climbs to the upper floor", () => {
    const r = map.floors.find((f) => f.id === "upper")!.rooms.find((x) => x.id === "u.son")!.rect;
    const to = walkable({ floor: "upper", x: (r.min.x + r.max.x) / 2, y: (r.min.y + r.max.y) / 2 });
    const walked = walk(createSim({ seed: 7, map, nav }), to);
    expect(walked.last).toEqual(to);
    expect(walked.floors).toContain("upper");
  });

  it("two runs give identical hashes tick by tick, and a save/restore in mid-route changes nothing", () => {
    const to = walkable(study());
    const a = createSim({ seed: 7, map, nav }), b = createSim({ seed: 7, map, nav });
    a.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to });
    b.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to });
    for (let i = 0; i < 120; i++) {
      a.step();
      b.step();
      expect(a.hash()).toBe(b.hash());
    }
    const c = createSim({ seed: 7, map, nav });
    c.restore(a.serialize());
    expect(c.hash()).toBe(a.hash());
    for (let i = 0; i < 300; i++) {
      const sa = a.step(), sc = c.step();
      expect(sc.snapshot).toEqual(sa.snapshot);
    }
    expect(c.hash()).toBe(a.hash());
  });

  it("rejects a move to a point that is not on the map", () => {
    const sim = createSim({ seed: 7, map, nav });
    sim.enqueue({ kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: -35, y: 110 } });
    expect(sim.step().events).toContainEqual(expect.objectContaining({ type: "commandRejected", reason: expect.stringContaining("route") }));
  });
});
