import { describe, expect, it } from "vitest";
import type { MapFile, Room } from "@war-room/content";
import { MapFile as MapFileSchema } from "@war-room/content";
import { deriveWalls, formatMap } from "../src/derive-walls";

const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  min: { x: x0, y: y0 },
  max: { x: x1, y: y1 },
});
const room = (id: string, r: ReturnType<typeof rect>, tags: string[], ceiling = 3): Room => ({
  id,
  name: id,
  rect: r,
  ceiling,
  tags,
});

function fixture(): MapFile {
  return {
    id: "fx",
    version: 1,
    bounds: rect(-10, -10, 20, 20),
    floors: [
      {
        id: "ground",
        elevation: 0,
        rooms: [
          room("g.a", rect(0, 0, 4, 4), ["interior"]),
          room("g.b", rect(4, 0, 8, 4), ["interior", "panic-room"]),
        ],
        walls: [],
        doors: [
          { id: "d.ab", at: { x: 4, y: 2 }, width: 1, between: ["g.a", "g.b"], kind: "standard", state: "closed", breach: ["manual"] },
          { id: "d.out", at: { x: 2, y: 0 }, width: 2, between: ["g.a", "outside"], kind: "standard", state: "closed", breach: ["manual"] },
        ],
        windows: [],
        openings: [],
        cover: [],
      },
      {
        id: "roof",
        elevation: 8,
        rooms: [room("r.roof", rect(0, 0, 8, 4), ["roof"], 10)],
        walls: [],
        doors: [],
        windows: [],
        openings: [],
        cover: [],
      },
    ],
    verticalLinks: [],
    zones: [],
    markers: [],
  };
}

const wallsOf = (map: MapFile, floor: string) => map.floors.find((f) => f.id === floor)!.walls;
const key = (w: { a: { x: number; y: number }; b: { x: number; y: number } }) =>
  `${w.a.x},${w.a.y}-${w.b.x},${w.b.y}`;

describe("deriveWalls", () => {
  it("creates one wall per room edge run, splitting shared edges into a single interior wall", () => {
    const walls = wallsOf(deriveWalls(fixture()), "ground");
    const shared = walls.filter((w) => w.a.x === 4 && w.b.x === 4);
    // door d.ab (width 1 at y=2) cuts the shared line into two pieces
    expect(shared.map(key).sort()).toEqual(["4,0-4,1.5", "4,2.5-4,4"]);
  });

  it("cuts a gap exactly as wide as the door in exterior walls too", () => {
    const south = wallsOf(deriveWalls(fixture()), "ground").filter((w) => w.a.y === 0 && w.b.y === 0);
    expect(south.map(key).sort()).toEqual(["0,0-1,0", "3,0-4,0", "4,0-8,0"]);
  });

  it("makes panic-room walls reinforced and indestructible, interior walls plaster", () => {
    const walls = wallsOf(deriveWalls(fixture()), "ground");
    for (const w of walls.filter((w) => w.a.x === 4 && w.b.x === 4)) {
      expect(w).toMatchObject({ material: "reinforced", destructible: false });
    }
    const aWest = walls.find((w) => w.a.x === 0 && w.b.x === 0)!;
    expect(aWest).toMatchObject({ material: "reinforced", destructible: true }); // house exterior
  });

  it("uses plaster for interior walls between ordinary rooms", () => {
    const map = fixture();
    map.floors[0]!.rooms[1] = room("g.b", rect(4, 0, 8, 4), ["interior"]);
    const shared = wallsOf(deriveWalls(map), "ground").filter((w) => w.a.x === 4 && w.b.x === 4);
    for (const w of shared) expect(w).toMatchObject({ material: "plaster", destructible: true });
  });

  it("gives every wall a positive thickness and the room ceiling as height", () => {
    for (const w of wallsOf(deriveWalls(fixture()), "ground")) {
      expect(w.thickness).toBeGreaterThan(0);
      expect(w.height).toBe(3);
    }
  });

  it("does not make walls on the roof (the parapet is cover)", () => {
    expect(wallsOf(deriveWalls(fixture()), "roof")).toEqual([]);
  });

  it("is idempotent and its output validates against the schema", () => {
    const once = deriveWalls(fixture());
    const twice = deriveWalls(once);
    expect(twice).toEqual(once);
    expect(MapFileSchema.safeParse(once).success).toBe(true);
  });

  it("keeps hand-authored fixed walls and replaces stale derived ones", () => {
    const map = fixture();
    const fixed = { id: "w.fixed.perimeter", a: { x: -5, y: 0 }, b: { x: -5, y: 9 }, thickness: 0.6, height: 3, material: "perimeter" as const, destructible: true };
    const stale = { ...fixed, id: "w.ground.old", material: "glass" as const };
    map.floors[0]!.walls = [fixed, stale];
    const walls = wallsOf(deriveWalls(map), "ground");
    expect(walls).toContainEqual(fixed);
    expect(walls.find((w) => w.id === "w.ground.old")).toBeUndefined();
  });

  it("orders walls by id so diffs are stable, whatever the room order", () => {
    const a = fixture();
    const b = fixture();
    b.floors[0]!.rooms.reverse();
    expect(wallsOf(deriveWalls(b), "ground")).toEqual(wallsOf(deriveWalls(a), "ground"));
    const ids = wallsOf(deriveWalls(a), "ground").map((w) => w.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("throws, naming the door, when a door is not on any wall", () => {
    const map = fixture();
    map.floors[0]!.doors.push({ id: "d.lost", at: { x: 2, y: 2 }, width: 1, between: ["g.a", "outside"], kind: "standard", state: "closed", breach: [] });
    expect(() => deriveWalls(map)).toThrow(/d\.lost/);
  });

  it("throws, naming both rooms, when two rooms overlap", () => {
    const map = fixture();
    map.floors[0]!.rooms.push(room("g.c", rect(2, 2, 6, 6), ["interior"]));
    expect(() => deriveWalls(map)).toThrow(/g\.c/);
  });
});

describe("formatMap", () => {
  it("is valid JSON that round-trips, ends with a newline, and keeps small objects on one line", () => {
    const map = deriveWalls(fixture());
    const text = formatMap(map);
    expect(JSON.parse(text)).toEqual(map);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('"min": { "x": 0, "y": 0 }');
    expect(formatMap(map)).toBe(text);
  });
});
