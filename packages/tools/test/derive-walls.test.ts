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

describe("deriveWalls: courtyards, arcades and voids", () => {
  const twoRooms = (a: Room, b: Room): MapFile => {
    const map = fixture();
    map.floors[0]!.rooms = [a, b];
    map.floors[0]!.doors = [];
    return map;
  };
  const between = (map: MapFile, x: number) => wallsOf(deriveWalls(map), "ground").filter((w) => w.a.x === x && w.b.x === x);

  it("leaves an arcade open to the courtyard: no wall on the shared edge, columns stand there instead", () => {
    const map = twoRooms(
      room("g.loggia", rect(0, 0, 4, 4), ["interior", "hall", "arcade"]),
      room("g.court", rect(4, 0, 8, 4), ["exterior", "courtyard"]),
    );
    expect(between(map, 4)).toEqual([]);
    // the arcade's other sides are still walled
    expect(wallsOf(deriveWalls(map), "ground").some((w) => w.a.x === 0 && w.b.x === 0)).toBe(true);
  });

  it("walls a non-arcade room against the courtyard as house exterior (reinforced)", () => {
    const map = twoRooms(room("g.hall", rect(0, 0, 4, 4), ["interior", "hall"]), room("g.court", rect(4, 0, 8, 4), ["exterior", "courtyard"]));
    for (const w of between(map, 4)) expect(w).toMatchObject({ material: "reinforced", destructible: true });
    expect(between(map, 4).length).toBeGreaterThan(0);
  });

  it("puts a low glass balustrade on the courtyard's own open edges", () => {
    const map = twoRooms(room("g.hall", rect(0, 0, 4, 4), ["interior", "hall"]), room("g.court", rect(4, 0, 8, 4), ["exterior", "courtyard"]));
    const east = between(map, 8);
    expect(east.length).toBe(1);
    expect(east[0]).toMatchObject({ material: "glass", height: 1.1 });
  });

  it("uses a railing between a void and a walkway (hall), but a solid wall between a void and a bedroom", () => {
    const walkway = twoRooms(room("u.gallery", rect(0, 0, 4, 4), ["interior", "hall"]), room("u.void", rect(4, 0, 8, 4), ["interior", "void"]));
    for (const w of between(walkway, 4)) expect(w).toMatchObject({ material: "glass", height: 1.1 });
    const bedroom = twoRooms(room("u.bed", rect(0, 0, 4, 4), ["interior"]), room("u.void", rect(4, 0, 8, 4), ["interior", "void"]));
    for (const w of between(bedroom, 4)) expect(w).toMatchObject({ material: "plaster", height: 3 });
  });

  it("puts a railing on a void's own open edge on the outline instead of a full wall", () => {
    const map = twoRooms(room("u.bed", rect(0, 0, 4, 4), ["interior"]), room("u.void", rect(4, 0, 8, 4), ["interior", "void"]));
    const east = between(map, 8);
    expect(east).toHaveLength(1);
    expect(east[0]).toMatchObject({ material: "glass", height: 1.1 });
  });
});

describe("deriveWalls: windows", () => {
  it("does not cut a gap for a window: a window sits in solid wall, only a door opens it", () => {
    const map = fixture();
    map.floors[0]!.windows = [{ id: "w.n", at: { x: 2, y: 4 }, width: 1, between: ["g.a", "outside"], shutter: true, blastRated: true }];
    const north = wallsOf(deriveWalls(map), "ground").filter((w) => w.a.y === 4 && w.b.y === 4 && Math.max(w.a.x, w.b.x) <= 4);
    expect(north.map(key)).toEqual(["0,4-4,4"]); // g.a's north wall stays one unbroken wall
  });
});

describe("deriveWalls: roof structures", () => {
  const roofMap = (): MapFile => {
    const map = fixture();
    map.floors[1]!.rooms = [
      room("r.deck", rect(0, 0, 4, 4), ["roof", "deck"], 10),
      room("r.bastion", rect(4, 0, 8, 4), ["roof", "structure", "bastion"], 3),
      room("r.walk", rect(0, 4, 4, 6), ["roof", "structure", "walkway"], 2.8),
    ];
    map.floors[1]!.doors = [];
    return map;
  };
  const roofWalls = (map: MapFile) => wallsOf(deriveWalls(map), "roof");

  it("builds hardened walls around a bastion, on every side, and none around the open deck", () => {
    const walls = roofWalls(roofMap());
    const bastion = walls.filter((w) => w.material === "reinforced");
    expect(bastion.length).toBeGreaterThanOrEqual(3);
    for (const w of bastion) expect(w).toMatchObject({ thickness: 0.5, destructible: false, height: 3 });
    // the deck's own open edges (west x = 0, south y = 0) have no wall
    expect(walls.some((w) => w.a.x === 0 && w.b.x === 0 && w.a.y < 4)).toBe(false);
    expect(walls.some((w) => w.a.y === 0 && w.b.y === 0 && w.b.x <= 4)).toBe(false);
  });

  it("walls the shared edge between a deck and a bastion (a bastion is a closed structure)", () => {
    const shared = roofWalls(roofMap()).filter((w) => w.a.x === 4 && w.b.x === 4 && Math.min(w.a.y, w.b.y) >= 0 && Math.max(w.a.y, w.b.y) <= 4);
    expect(shared.length).toBe(1);
  });

  it("makes a covered walkway out of lighter stone walls", () => {
    const walk = roofWalls(roofMap()).filter((w) => w.height === 2.8);
    expect(walk.length).toBeGreaterThan(0);
    for (const w of walk) expect(w.material).toBe("stone");
  });

  it("cuts a door gap in a structure wall, and ignores a roof door between two open decks", () => {
    const map = roofMap();
    map.floors[1]!.rooms.push(room("r.deck2", rect(-4, 0, 0, 4), ["roof", "deck"], 10));
    map.floors[1]!.doors = [
      { id: "d.bastion", at: { x: 4, y: 2 }, width: 1, between: ["r.deck", "r.bastion"], kind: "standard", state: "open", breach: [] },
      { id: "d.decks", at: { x: 0, y: 2 }, width: 6, between: ["r.deck2", "r.deck"], kind: "standard", state: "open", breach: [] },
    ];
    const shared = roofWalls(map).filter((w) => w.a.x === 4 && w.b.x === 4 && Math.max(w.a.y, w.b.y) <= 4);
    expect(shared.map(key).sort()).toEqual(["4,0-4,1.5", "4,2.5-4,4"]);
    expect(() => deriveWalls(map)).not.toThrow();
  });

  it("still makes no roof walls when no room is a structure (the parapet is cover)", () => {
    expect(roofWalls(fixture())).toEqual([]);
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
