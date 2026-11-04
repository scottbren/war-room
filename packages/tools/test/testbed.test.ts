import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav, createSim } from "@war-room/sim";
import type { Nav, Pos } from "@war-room/sim";
import { bakeNavmesh } from "../src/bake-navmesh";
import { deriveWalls } from "../src/derive-walls";
import { makeTestbedMap } from "../src/makeTestbed";
import { validateMap } from "../src/validate-map";

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const raw = JSON.parse(file("../../content/maps/testbed.json").toString("utf8"));
const map = MapFile.parse(raw);
const committedNavmesh = new Uint8Array(file("../../content/generated/testbed.navmesh.bin"));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: committedNavmesh, map });
});

const p = (floor: Pos["floor"], x: number, y: number): Pos => ({ floor, x, y }) as Pos;
const length = (path: Pos[]): number => path.slice(1).reduce((s, q, i) => s + (q.floor === path[i]!.floor ? Math.hypot(q.x - path[i]!.x, q.y - path[i]!.y) : 0), 0);

describe("testbed: the small dev map", () => {
  it("is valid, and the committed file is the generator output with derived walls", () => {
    expect(validateMap(raw)).toEqual([]);
    expect(deriveWalls(makeTestbedMap())).toEqual(map);
  });

  it("has a committed navmesh that matches a fresh bake (run pnpm bake-navmesh testbed if this fails)", async () => {
    const fresh = await bakeNavmesh(map);
    expect(Buffer.from(fresh).equals(Buffer.from(committedNavmesh))).toBe(true);
  }, 60_000);

  it("has one of each thing the systems care about", () => {
    const ground = map.floors.find((f) => f.id === "ground")!;
    expect(ground.doors.filter((d) => d.state === "locked").length).toBeGreaterThanOrEqual(1);
    expect(ground.doors.filter((d) => d.hidden === true).map((d) => d.id)).toEqual(["d.t.study-vault"]);
    expect(ground.windows.some((w) => w.shutter)).toBe(true);
    expect(map.verticalLinks.some((l) => l.kind === "stairs")).toBe(true);
    expect(map.markers.filter((m) => m.tags.includes("side:operator")).length).toBe(2);
    expect(map.markers.filter((m) => m.tags.includes("side:defender")).length).toBe(3);
    for (const tag of ["principal-start:study", "family:wife", "smart:camera"]) expect(map.markers.some((m) => m.tags.includes(tag)), tag).toBe(true);
  });

  it("can be walked: yard to study, to the upper bedroom, and from the study to the vault through the secret door", () => {
    expect(nav.findPath(p("grounds", 10, 1), p("ground", 17, 14)).length).toBeGreaterThan(1);
    expect(nav.findPath(p("grounds", 10, 1), p("upper", 21, 10)).length).toBeGreaterThan(1);
    const secret = length(nav.findPath(p("ground", 17, 14), p("ground", 21.5, 15)));
    expect(secret).toBeGreaterThan(0);
    expect(secret).toBeLessThan(8);
  });

  it("runs in the sim: all five starting units appear and an operator can be ordered to the hall", () => {
    const sim = createSim({ seed: 1, map, nav });
    const first = sim.step();
    expect(first.snapshot.entities.length).toBe(5);
    sim.enqueue({ kind: "move", tick: first.snapshot.tick, entity: "op.alpha.1", to: p("ground", 16, 7.5) });
    let last = first.snapshot;
    for (let i = 0; i < 300; i++) last = sim.step().snapshot;
    const op = last.entities.find((e) => e.id === "op.alpha.1")!;
    expect(Math.hypot(op.pos.x - 16, op.pos.y - 7.5)).toBeLessThan(1);
  });
});
