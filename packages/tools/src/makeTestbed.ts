import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MapFile } from "@war-room/content";
import type { Door, Marker, Room } from "@war-room/content";

/**
 * TESTBED: a 30 x 24 m dev fixture for UI and game-logic work. Not game content.
 * One small house (two storeys) in a yard, with one of everything the systems care about:
 * an ordinary door, a locked door, a hidden door, a window with a shutter, a stair, cover,
 * a camera, family and principal markers, operators and defenders.
 * Walls are derived (`pnpm derive-walls testbed`); the navmesh is baked (`pnpm bake-navmesh testbed`).
 */

const rect = (x0: number, y0: number, x1: number, y1: number) => ({ min: { x: x0, y: y0 }, max: { x: x1, y: y1 } });
const room = (id: string, name: string, r: ReturnType<typeof rect>, tags: string[], ceiling = 3): Room => ({ id, name, rect: r, ceiling, tags });
const door = (id: string, x: number, y: number, width: number, a: string, b: string, state: Door["state"], extra: Partial<Door> = {}): Door => ({
  id,
  at: { x, y },
  width,
  between: [a, b],
  kind: "standard",
  state,
  breach: ["manual", "shotgun", "explosive"],
  ...extra,
});
const marker = (id: string, floor: Marker["floor"], kind: Marker["kind"], x: number, y: number, tags: string[]): Marker => ({ id, floor, kind, at: { x, y }, tags });

export function makeTestbedMap(): MapFile {
  const map = {
    id: "testbed",
    version: 1,
    bounds: rect(-5, -5, 35, 29),
    floors: [
      {
        id: "grounds",
        elevation: 0,
        rooms: [],
        walls: [],
        doors: [],
        windows: [],
        openings: [],
        cover: [
          { id: "cover.yard-hedge.1", rect: rect(2, 8, 4, 14), type: "concealment", height: 1.6, facing: "all", destructible: true },
          { id: "cover.yard-hedge.2", rect: rect(26, 8, 28, 14), type: "concealment", height: 1.6, facing: "all", destructible: true },
          { id: "cover.yard-planter", rect: rect(16, 2, 18, 3), type: "light", height: 0.9, facing: "all", destructible: true },
        ],
      },
      {
        id: "ground",
        elevation: 0,
        rooms: [
          room("t.lobby", "Lobby", rect(6, 6, 14, 12), ["interior"]),
          room("t.hall", "Hall", rect(14, 6, 24, 12), ["interior", "hall"]),
          room("t.office", "Office", rect(6, 12, 14, 18), ["interior"]),
          room("t.study", "Study", rect(14, 12, 19, 18), ["interior", "principal-option"]),
          room("t.vault", "Vault", rect(19, 12, 24, 18), ["interior", "vault"]),
        ],
        walls: [],
        doors: [
          door("d.t.front", 10, 6, 1.4, "t.lobby", "outside", "closed"),
          door("d.t.lobby-hall", 14, 9, 2, "t.lobby", "t.hall", "open"),
          door("d.t.lobby-office", 10, 12, 1.2, "t.lobby", "t.office", "locked"),
          door("d.t.hall-study", 16, 12, 1.2, "t.hall", "t.study", "closed"),
          door("d.t.hall-vault", 22, 12, 1.2, "t.hall", "t.vault", "locked"),
          door("d.t.study-vault", 19, 15, 1.2, "t.study", "t.vault", "closed", { hidden: true }),
        ],
        windows: [{ id: "win.t.hall.s", at: { x: 19, y: 6 }, width: 2, between: ["t.hall", "outside"], shutter: true, blastRated: true }],
        openings: [],
        cover: [
          { id: "cover.t.lobby-bench", rect: rect(7, 7, 9, 8), type: "light", height: 0.5, facing: "all", destructible: true },
          { id: "cover.t.hall-table", rect: rect(17, 8, 21, 10), type: "light", height: 0.8, facing: "all", destructible: true },
          { id: "cover.t.study-desk", rect: rect(15, 15, 18, 16.5), type: "heavy", height: 0.9, facing: "all", destructible: true },
        ],
      },
      {
        id: "upper",
        elevation: 4,
        rooms: [
          room("t.landing", "Landing", rect(6, 6, 14, 12), ["interior", "hall"]),
          room("t.bedroom", "Bedroom", rect(14, 6, 24, 12), ["interior", "family"]),
        ],
        walls: [],
        doors: [door("d.t.landing-bedroom", 14, 9, 1.2, "t.landing", "t.bedroom", "closed")],
        windows: [],
        openings: [],
        cover: [{ id: "cover.t.bed", rect: rect(19, 7, 23, 9), type: "light", height: 0.6, facing: "all", destructible: true }],
      },
    ],
    verticalLinks: [{ id: "link.stairs", kind: "stairs", from: { floor: "ground", at: { x: 8, y: 10 } }, to: { floor: "upper", at: { x: 8, y: 10 } }, bidirectional: true }],
    zones: [
      { id: "zone.yard", floor: "grounds", rect: rect(0, 0, 30, 24), kind: "lawn" },
      { id: "zone.road", floor: "grounds", rect: rect(-5, 24, 35, 29), kind: "road" },
    ],
    markers: [
      marker("m.approach.A", "grounds", "approach", 10, 0, ["approach:A", "approach:south"]),
      marker("m.spawn.op1", "grounds", "spawn", 9, 1, ["entity:op.alpha.1", "side:operator"]),
      marker("m.spawn.op2", "grounds", "spawn", 11, 1, ["entity:op.alpha.2", "side:operator"]),
      marker("m.spawn.def1", "ground", "spawn", 18, 8.5, ["entity:def.test.1", "side:defender", "facing:180"]),
      marker("m.spawn.def2", "ground", "spawn", 16.5, 14, ["entity:def.test.2", "side:defender", "facing:180"]),
      marker("m.spawn.def3", "grounds", "spawn", 3, 11, ["entity:def.test.3", "side:defender", "facing:90"]),
      marker("m.principal.study", "ground", "poi", 17, 14, ["principal-start:study"]),
      marker("m.family.wife", "upper", "poi", 21, 10, ["family:wife"]),
      marker("m.drive.study-desk", "ground", "poi", 15.5, 16.8, ["poi:drive", "drive:study-desk"]),
      marker("m.routine.wife.hall", "ground", "poi", 15.5, 7.5, ["routine:lounge", "member:wife"]),
      marker("m.smart.camera.hall", "ground", "poi", 23, 7, ["smart:camera", "covers:hall"]),
    ],
  };
  return MapFile.parse(map);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = fileURLToPath(new URL("../../content/maps/testbed.json", import.meta.url));
  writeFileSync(file, `${JSON.stringify(makeTestbedMap(), null, 2)}\n`);
  console.log("Wrote testbed.json (run `pnpm derive-walls testbed` next)");
}
