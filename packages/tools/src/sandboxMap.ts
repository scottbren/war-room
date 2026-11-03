import type { MapFile } from "@war-room/content";

const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  min: { x: x0, y: y0 },
  max: { x: x1, y: y1 },
});

/**
 * Built-in 40 x 30 m single-floor map for exercising the harness before the
 * real CHARON map exists (T5). Not game content.
 */
export function makeSandboxMap(): MapFile {
  return {
    id: "sandbox",
    version: 1,
    bounds: rect(0, 0, 40, 30),
    floors: [
      {
        id: "ground",
        elevation: 0,
        rooms: [
          { id: "g.west", name: "West hall", rect: rect(0, 0, 20, 30), ceiling: 3, tags: ["interior"] },
          { id: "g.east", name: "East hall", rect: rect(20, 0, 40, 30), ceiling: 3, tags: ["interior"] },
        ],
        walls: [],
        doors: [
          {
            id: "d.front",
            at: { x: 10, y: 0 },
            width: 1,
            between: ["g.west", "outside"],
            kind: "standard",
            state: "closed",
            breach: ["manual"],
          },
          {
            id: "d.middle",
            at: { x: 20, y: 15 },
            width: 1,
            between: ["g.west", "g.east"],
            kind: "standard",
            state: "locked",
            breach: ["manual", "explosive"],
          },
        ],
        windows: [],
        openings: [],
        cover: [],
      },
    ],
    verticalLinks: [],
    zones: [],
    markers: [
      { id: "m.op1", floor: "ground", kind: "spawn", at: { x: 5, y: 2 }, tags: ["entity:op.alpha.1", "side:operator"] },
      { id: "m.op2", floor: "ground", kind: "spawn", at: { x: 7, y: 2 }, tags: ["entity:op.alpha.2", "side:operator"] },
      { id: "m.def1", floor: "ground", kind: "spawn", at: { x: 30, y: 20 }, tags: ["entity:def.vet.1", "side:defender"] },
      { id: "m.def2", floor: "ground", kind: "spawn", at: { x: 33, y: 24 }, tags: ["entity:def.vet.2", "side:defender"] },
    ],
  };
}
