import { describe, expect, it } from "vitest";
import { floorCandidates } from "../src/picking";

const elevations = { grounds: 0, ground: 0, upper: 4, roof: 8, lower: -4, shore: -5, hill: 4 } as const;

describe("floorCandidates", () => {
  it("intersects a downward ray with each visible floor plane, nearest first (highest floor first)", () => {
    // From 100 m up, looking straight down at map (10, 20): babylon x = 10, z = 20.
    const c = floorCandidates({ origin: [10, 100, 20], direction: [0, -1, 0] }, ["ground", "upper", "roof"], elevations);
    expect(c.map((p) => p.floor)).toEqual(["roof", "upper", "ground"]);
    for (const p of c) expect(p).toMatchObject({ x: 10, y: 20 });
  });

  it("follows a slanted ray: x and y shift with the height of the floor", () => {
    // moving +1 in x for every 1 down; from height 12 to the roof (8) is 4 m, to the ground (0) is 12 m
    const c = floorCandidates({ origin: [0, 12, 0], direction: [1, -1, 0] }, ["ground", "roof"], elevations);
    expect(c[0]).toEqual({ floor: "roof", x: 4, y: 0 });
    expect(c[1]).toEqual({ floor: "ground", x: 12, y: 0 });
  });

  it("skips floors the ray never reaches, hidden floors, and planes behind the camera", () => {
    const c = floorCandidates({ origin: [0, 6, 0], direction: [0, -1, 0] }, ["ground", "roof", "lower"], elevations);
    expect(c.map((p) => p.floor)).toEqual(["ground", "lower"]); // the roof (8) is above the camera
    expect(floorCandidates({ origin: [0, 6, 0], direction: [0, 1, 0] }, ["ground"], elevations)).toEqual([]);
    expect(floorCandidates({ origin: [0, 6, 0], direction: [1, 0, 0] }, ["ground"], elevations)).toEqual([]);
  });

  it("rounds to the 1 cm grid", () => {
    const [p] = floorCandidates({ origin: [0.123456, 10, 9.87654], direction: [0, -1, 0] }, ["ground"], elevations);
    expect(p).toEqual({ floor: "ground", x: 0.12, y: 9.88 });
  });
});
