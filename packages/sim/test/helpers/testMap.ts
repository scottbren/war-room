import type { MapFile } from "@war-room/content";

const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  min: { x: x0, y: y0 },
  max: { x: x1, y: y1 },
});

/** Tiny single-floor map: one 20x20 room, one door, two spawn markers. */
export function makeTestMap(): MapFile {
  return {
    id: "test",
    version: 1,
    bounds: rect(0, 0, 20, 20),
    floors: [
      {
        id: "ground",
        elevation: 0,
        rooms: [{ id: "g.a", name: "Room A", rect: rect(0, 0, 20, 20), ceiling: 3, tags: ["interior"] }],
        walls: [],
        doors: [
          {
            id: "d.front",
            at: { x: 5, y: 0 },
            width: 1,
            between: ["g.a", "outside"],
            kind: "standard",
            state: "closed",
            breach: ["manual"],
          },
          {
            id: "d.back",
            at: { x: 15, y: 0 },
            width: 1,
            between: ["g.a", "outside"],
            kind: "standard",
            state: "locked",
            breach: ["manual"],
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
      // Deliberately listed out of id order to prove spawn order does not depend on file order.
      { id: "m.def", floor: "ground", kind: "spawn", at: { x: 10, y: 0 }, tags: ["entity:def.vet.1", "side:defender"] },
      { id: "m.op", floor: "ground", kind: "spawn", at: { x: 0, y: 0 }, tags: ["entity:op.alpha.1", "side:operator"] },
      { id: "m.poi", floor: "ground", kind: "poi", at: { x: 3, y: 3 }, tags: ["poi:drive"] },
    ],
  };
}
