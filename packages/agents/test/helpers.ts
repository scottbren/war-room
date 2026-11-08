import { MapFile } from "@war-room/content";
import type { Snapshot } from "@war-room/sim";
import testbed from "../../content/maps/testbed.json";

export const map = MapFile.parse(testbed);
// Rooms on the testbed's ground floor: Hall x 14-24, y 6-12; Lobby x 6-14, y 6-12; Study x 14-19, y 12-18.
export const HALL = { x: 19, y: 9 }, LOBBY = { x: 10, y: 9 }, STUDY = { x: 16, y: 15 };

export type Ent = { id: string; side: "operator" | "defender"; at: { x: number; y: number }; state?: "idle" | "down" };

export const snap = (tick: number, ents: Ent[]): Snapshot => ({
  tick,
  entities: ents.map((e) => ({ id: e.id, side: e.side, pos: { floor: "ground", ...e.at }, facing: 0, health: 100, state: e.state ?? "idle" })),
  doors: [],
  devices: [],
  shutters: [],
  alert: 0,
  hubOnline: true,
});

let n = 0;
/** The fields every event carries. */
export const base = (tick: number) => ({ id: `${tick}.${n++}`, tick, v: 1 as const });
