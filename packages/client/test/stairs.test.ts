import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import charonJson from "../../content/maps/charon.json";
import { stairLift } from "../src/stairs";

const map = MapFile.parse(charonJson);
const elevations = Object.fromEntries(map.floors.map((f) => [f.id, f.elevation])) as Record<string, number>;
// link.grand-stairs.west: ground (32, 41.2) up to upper (32, 50.2); 4 m of rise over 9 m of run.
const lift = (floor: string, x: number, y: number) => stairLift(map.verticalLinks, elevations as never, floor as never, x, y);

describe("stairLift: extra height of a unit standing on a stair flight", () => {
  it("is zero away from any stairs", () => {
    expect(lift("ground", 48, 68)).toBe(0);
    expect(lift("ground", 20, 20)).toBe(0);
    expect(lift("upper", 45, 51)).toBe(0);
  });

  it("is zero at the foot of the flight and rises evenly to the full rise at the top (climbing on the lower floor)", () => {
    expect(lift("ground", 32, 41.2)).toBeCloseTo(0, 6);
    expect(lift("ground", 32, 45.7)).toBeCloseTo(2, 6); // halfway
    expect(lift("ground", 32, 50.2)).toBeCloseTo(4, 6);
  });

  it("is continuous across the floor change: the lift at the top equals the next floor's elevation difference", () => {
    expect(lift("ground", 32, 50.2) + elevations.ground!).toBeCloseTo(elevations.upper!, 6);
  });

  it("lowers from the upper floor when walking down: zero at the top, back to the full drop at the foot", () => {
    expect(lift("upper", 32, 50.2)).toBeCloseTo(0, 6);
    expect(lift("upper", 32, 45.7)).toBeCloseTo(-2, 6);
    expect(lift("upper", 32, 41.2)).toBeCloseTo(-4, 6);
  });

  it("ignores positions beside the flight or beyond its ends", () => {
    expect(lift("ground", 36, 45.7)).toBe(0); // 4 m to the side
    expect(lift("ground", 32, 38)).toBe(0); // before the foot
    expect(lift("ground", 32, 53)).toBe(0); // past the top
  });

  it("skips flights that go straight up (no horizontal run to draw)", () => {
    const vertical = map.verticalLinks.filter((l) => l.kind === "stairs" && l.from.at.x === l.to.at.x && l.from.at.y === l.to.at.y);
    for (const l of vertical) expect(stairLift([l], elevations as never, l.from.floor, l.from.at.x, l.from.at.y)).toBe(0);
  });
});
