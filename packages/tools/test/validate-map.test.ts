import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import type { Floor } from "@war-room/content";
import { formatIssues, validateMap } from "../src/validate-map";
import type { Issue } from "../src/validate-map";

const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

/** A fresh, schema-valid copy of the real CHARON map to break in a test. */
const charon = (): MapFile => MapFile.parse(readJson("../../content/maps/charon.json"));
const floorOf = (map: MapFile, id: string): Floor => map.floors.find((f) => f.id === id)!;
const messages = (issues: Issue[]): string[] => issues.map((i) => i.message);
const find = (issues: Issue[], ...needles: string[]): Issue | undefined =>
  issues.find((i) => needles.every((n) => i.message.includes(n)));

describe("validateMap on the real map", () => {
  it("passes charon.json with no issues", () => {
    expect(messages(validateMap(charon()))).toEqual([]);
  });

  it("also accepts raw JSON, not only parsed maps", () => {
    expect(validateMap(readJson("../../content/maps/charon.json"))).toEqual([]);
  });
});

describe("broken fixture maps", () => {
  it("unreachable room: names the room that cannot be reached", () => {
    const issues = validateMap(readJson("./fixtures/broken-unreachable.json"));
    expect(find(issues, "g.vault", "cannot be reached")).toBeDefined();
    expect(find(issues, "g.a", "cannot be reached")).toBeUndefined(); // the connected rooms are fine
  });

  it("overlapping rooms: names both rooms and the floor", () => {
    const issues = validateMap(readJson("./fixtures/broken-overlap.json"));
    expect(find(issues, "g.a", "g.b", "overlap", "ground")).toBeDefined();
  });

  it("bad doors: names each door and what is wrong with it", () => {
    const issues = validateMap(readJson("./fixtures/broken-doors.json"));
    expect(find(issues, "d.self", "to itself")).toBeDefined();
    expect(find(issues, "d.floating", "not on any wall")).toBeDefined();
    expect(find(issues, "d.ghost", "unknown room", "g.nowhere")).toBeDefined();
    expect(find(issues, "d.fine")).toBeUndefined(); // the good door is not blamed
  });
});

describe("individual checks, by breaking a copy of charon", () => {
  it("a door joining two different rooms or a room and outside is fine; the gate may join outside to outside", () => {
    const map = charon();
    const gate = floorOf(map, "grounds").doors.find((d) => d.kind === "gate")!;
    expect(gate.between).toEqual(["outside", "outside"]);
    expect(validateMap(map)).toEqual([]);
  });

  it("a non-gate door joining outside to outside is rejected", () => {
    const map = charon();
    const door = floorOf(map, "grounds").doors.find((d) => d.id === "d.staff")!;
    door.between = ["outside", "outside"];
    expect(find(validateMap(map), "d.staff", "to itself")).toBeDefined();
  });

  it("a door moved off its wall is reported by id", () => {
    const map = charon();
    floorOf(map, "ground").doors.find((d) => d.id === "d.g.drawing-study")!.at = { x: 34.3, y: 42 };
    expect(find(validateMap(map), "d.g.drawing-study", "not on any wall")).toBeDefined();
  });

  it("overlapping rooms are reported, touching rooms are not", () => {
    const map = charon();
    const g = floorOf(map, "ground");
    g.rooms.push({ id: "g.extra", name: "Extra", rect: { min: { x: 49, y: 40 }, max: { x: 51, y: 42 } }, ceiling: 4, tags: [] });
    expect(find(validateMap(map), "g.grand-hall", "g.extra", "overlap")).toBeDefined();
  });

  it("a cover piece with no facing is reported by id (checked before the schema rejects it)", () => {
    const raw = structuredClone(readJson("../../content/maps/charon.json")) as { floors: { cover: Record<string, unknown>[] }[] };
    const cover = raw.floors[0]!.cover[0]!;
    delete cover["facing"];
    const issues = validateMap(raw);
    expect(find(issues, String(cover["id"]), "no facing")).toBeDefined();
    expect(issues.filter((i) => i.message.includes(String(cover["id"]))).length).toBe(1); // not reported twice
  });

  it("a cover piece with a bad facing angle is reported", () => {
    const map = charon();
    const planter = floorOf(map, "grounds").cover.find((c) => c.id === "cover.planter.1")!;
    planter.facing = 400;
    expect(find(validateMap(map), "cover.planter.1", "facing")).toBeDefined();
  });

  it("the panic room must have a door to the hall", () => {
    const map = charon();
    const g = floorOf(map, "ground");
    g.doors = g.doors.filter((d) => d.id !== "d.g.panic-loggia");
    expect(find(validateMap(map), "g.panic", "hall")).toBeDefined();
  });

  it("the hall is any room tagged 'hall', not a naming convention", () => {
    const map = charon();
    const loggia = floorOf(map, "ground").rooms.find((r) => r.id === "g.loggia.e")!;
    expect(loggia.tags).toContain("hall");
    loggia.tags = loggia.tags.filter((t) => t !== "hall");
    expect(find(validateMap(map), "g.panic", "hall")).toBeDefined();
  });

  it("doors between open roof decks need no wall (decks have only a parapet of cover)", () => {
    const map = charon();
    const roof = floorOf(map, "roof");
    expect(roof.doors.length).toBeGreaterThan(0);
    expect(roof.doors.some((d) => d.between.every((id) => id.startsWith("r.deck.")))).toBe(true);
    expect(validateMap(map)).toEqual([]);
  });

  it("the panic room must be reachable from the upper-floor shaft", () => {
    const map = charon();
    map.verticalLinks = map.verticalLinks.filter((l) => l.id !== "link.shaft");
    expect(find(validateMap(map), "g.panic", "shaft")).toBeDefined();
  });

  it("the shaft must land in the panic room, not somewhere else", () => {
    const map = charon();
    map.verticalLinks.find((l) => l.id === "link.shaft")!.to.at = { x: 40, y: 20 };
    expect(find(validateMap(map), "g.panic", "shaft")).toBeDefined();
  });

  it("the tunnel must exit inside the boathouse", () => {
    const map = charon();
    map.verticalLinks.find((l) => l.id === "link.tunnel")!.to.at = { x: 50, y: 5 };
    expect(find(validateMap(map), "link.tunnel", "boathouse")).toBeDefined();
  });

  it("a missing tunnel is reported", () => {
    const map = charon();
    map.verticalLinks = map.verticalLinks.filter((l) => l.id !== "link.tunnel");
    expect(find(validateMap(map), "g.panic", "tunnel")).toBeDefined();
  });

  it("family rooms must be on the upper floor", () => {
    const map = charon();
    floorOf(map, "ground").rooms.find((r) => r.id === "g.study")!.tags.push("family");
    expect(find(validateMap(map), "g.study", "family", "upper")).toBeDefined();
  });

  it("a locked door still counts as a way in (it can be breached)", () => {
    const map = charon();
    for (const d of floorOf(map, "ground").doors) d.state = "locked";
    expect(validateMap(map)).toEqual([]);
  });

  it("removing every vertical link to the roof cuts the roof off", () => {
    const map = charon();
    map.verticalLinks = map.verticalLinks.filter((l) => l.kind !== "roof-access");
    // the ladder top is a door to "outside" on the roof, which the validator treats as a way in
    floorOf(map, "roof").doors = floorOf(map, "roof").doors.filter((d) => d.id !== "d.r.nw-ladder");
    expect(find(validateMap(map), "r.deck.main", "cannot be reached")).toBeDefined();
  });

  it("the roof stays reachable if one of its three access routes is lost", () => {
    const map = charon();
    map.verticalLinks = map.verticalLinks.filter((l) => l.id !== "link.roof");
    expect(validateMap(map)).toEqual([]);
  });

  it("void rooms are not expected to be reachable", () => {
    const map = charon();
    expect(floorOf(map, "upper").rooms.find((r) => r.id === "u.void")!.tags).toContain("void");
    expect(find(validateMap(map), "u.void")).toBeUndefined();
  });

  it("a map without an approach A marker says so", () => {
    const map = charon();
    map.markers = map.markers.filter((m) => !m.tags.includes("approach:A"));
    expect(find(validateMap(map), "approach A")).toBeDefined();
  });
});

describe("required rooms and link ends", () => {
  it("CHARON must have a panic room, a safe landing and a tunnel exit (the checks cannot pass vacuously)", () => {
    for (const [floorId, roomId, tag] of [
      ["ground", "g.panic", "panic-room"],
      ["upper", "u.safe", "safe-landing"],
      ["shore", "grounds.boathouse", "tunnel-exit"],
    ] as const) {
      const map = charon();
      const room = floorOf(map, floorId).rooms.find((r) => r.id === roomId)!;
      room.tags = room.tags.filter((t) => t !== tag);
      expect(find(validateMap(map), "charon", `"${tag}"`, "must have"), tag).toBeDefined();
    }
  });

  it("other maps are not forced to have a panic room", () => {
    const issues = validateMap(readJson("./fixtures/broken-unreachable.json"));
    expect(find(issues, "panic-room")).toBeUndefined();
  });

  it("a link end on an indoor floor must be inside a room", () => {
    const map = charon();
    map.verticalLinks.find((l) => l.id === "link.stairs")!.to.at = { x: 33, y: 3 };
    const issue = find(validateMap(map), "link.stairs", "not inside any room");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("upper");
  });

  it("a link end on the open shore or grounds may be outdoors (cliff path, tunnel exit)", () => {
    const map = charon();
    const cliff = map.verticalLinks.find((l) => l.id === "link.cliff")!;
    expect(cliff.from.floor).toBe("shore");
    expect(cliff.to.floor).toBe("grounds");
    expect(validateMap(map)).toEqual([]);
  });
});

describe("extra levels (lower, shore, hill)", () => {
  const withLevel = (id: "lower" | "shore" | "hill", elevation: number): MapFile => {
    const map = charon();
    if (!map.floors.some((f) => f.id === id)) map.floors.push({ id, elevation, rooms: [], walls: [], doors: [], windows: [], openings: [], cover: [] });
    return map;
  };

  it("the schema accepts the three extra floor ids", () => {
    for (const [id, elevation] of [["lower", -4], ["shore", -5], ["hill", 3]] as const) {
      expect(MapFile.safeParse(withLevel(id, elevation)).success, id).toBe(true);
    }
  });

  it("a link end on the open shore or hill may be outdoors, like the grounds", () => {
    for (const [id, elevation] of [["shore", -5], ["hill", 3]] as const) {
      const map = withLevel(id, elevation);
      map.verticalLinks.push({ id: "link.test", kind: "cliff-path", from: { floor: id, at: { x: 18, y: -6 } }, to: { floor: "grounds", at: { x: 18, y: 0 } }, bidirectional: true });
      expect(validateMap(map), id).toEqual([]);
    }
  });

  it("a link end on the lower (indoor) level must still be inside a room", () => {
    const map = withLevel("lower", -4);
    map.verticalLinks.push({ id: "link.test", kind: "stairs", from: { floor: "lower", at: { x: 45, y: 20 } }, to: { floor: "ground", at: { x: 45, y: 20 } }, bidirectional: true });
    expect(find(validateMap(map), "link.test", "not inside any room")).toBeDefined(); // under the open courtyard: no basement room
  });

  it("the panic-room tunnel may exit on the shore as well as on the grounds", () => {
    const map = withLevel("shore", -5);
    const shore = floorOf(map, "shore");
    shore.rooms.push({ id: "shore.cave", name: "Tunnel cave", rect: { min: { x: 0, y: -30 }, max: { x: 4, y: -26 } }, ceiling: 3, tags: ["tunnel-exit"] });
    const boathouse = floorOf(map, "shore").rooms.find((r) => r.id === "grounds.boathouse")!;
    boathouse.tags = boathouse.tags.filter((t) => t !== "tunnel-exit");
    map.verticalLinks.find((l) => l.id === "link.tunnel")!.to = { floor: "shore", at: { x: 2, y: -28 } };
    expect(validateMap(map)).toEqual([]);
  });
});

describe("windows", () => {
  const win = (id: string, x: number, y: number, between: [string, string], width = 1.8) => ({ id, at: { x, y }, width, between, shutter: true, blastRated: true });

  it("accepts an armored window in an exterior wall", () => {
    const map = charon();
    floorOf(map, "ground").windows.push(win("w.ok", 28, 22, ["g.master", "outside"]));
    expect(validateMap(map)).toEqual([]);
  });

  it("rejects a window that is not on any wall", () => {
    const map = charon();
    floorOf(map, "ground").windows.push(win("w.floating", 33, 22, ["g.master", "outside"]));
    expect(find(validateMap(map), "w.floating", "not on any wall")).toBeDefined();
  });

  it("rejects a window naming a room that is not on that floor", () => {
    const map = charon();
    floorOf(map, "ground").windows.push(win("w.ghost", 28, 22, ["g.nowhere", "outside"]));
    expect(find(validateMap(map), "w.ghost", "unknown room", "g.nowhere")).toBeDefined();
  });

  it("rejects a window that does not face the outside", () => {
    const map = charon();
    floorOf(map, "ground").windows.push(win("w.inside", 28, 22, ["g.master", "g.study"]));
    expect(find(validateMap(map), "w.inside", "outside")).toBeDefined();
  });

  it("rejects windows in the panic room and the safe landing", () => {
    const map = charon();
    floorOf(map, "ground").windows.push(win("w.panic", 72, 22, ["g.panic", "outside"]));
    floorOf(map, "upper").windows.push(win("w.safe", 72, 22, ["u.safe", "outside"]));
    const issues = validateMap(map);
    expect(find(issues, "w.panic", "g.panic")).toBeDefined();
    expect(find(issues, "w.safe", "u.safe")).toBeDefined();
  });

  it("rejects a window that overlaps a door on the same wall", () => {
    const map = charon();
    // d.g.master-terrace is a 2 m glass door at (33,16) on the south wall
    floorOf(map, "ground").windows.push(win("w.clash", 33.5, 16, ["g.master", "outside"], 1.2));
    expect(find(validateMap(map), "w.clash", "d.g.master-terrace", "overlaps")).toBeDefined();
  });

  it("allows a window beside a door", () => {
    const map = charon();
    floorOf(map, "ground").windows.push(win("w.beside", 29.6, 16, ["g.master", "outside"], 1.6));
    expect(validateMap(map)).toEqual([]);
  });
});

describe("security center", () => {
  it("CHARON must have a room tagged security-center (the checks cannot pass without one)", () => {
    const map = charon();
    for (const f of map.floors) for (const r of f.rooms) r.tags = r.tags.filter((t) => t !== "security-center");
    expect(find(validateMap(map), "charon", "\"security-center\"", "must have")).toBeDefined();
  });
});

describe("schema problems", () => {
  it("reports schema errors with ids in the path, and skips the semantic checks", () => {
    const raw = structuredClone(readJson("../../content/maps/charon.json")) as {
      floors: { id: string; rooms: { id: string; ceiling: number }[] }[];
    };
    const roomId = raw.floors[1]!.rooms[0]!.id;
    raw.floors[1]!.rooms[0]!.ceiling = -1;
    const issues = validateMap(raw);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/Schema/);
    expect(issues[0]!.message).toContain("ground");
    expect(issues[0]!.message).toContain(roomId);
    expect(issues[0]!.message).toContain("ceiling");
  });

  it("rejects non-object input", () => {
    expect(validateMap(42)).toHaveLength(1);
    expect(validateMap(null)).toHaveLength(1);
  });
});

describe("formatIssues", () => {
  it("prints one line per issue and a clear OK line when there are none", () => {
    expect(formatIssues("charon", [])).toBe("OK charon: no problems found");
    const text = formatIssues("charon", [{ check: "rooms-overlap", message: "Rooms a and b overlap on floor ground" }]);
    expect(text).toContain("1 problem");
    expect(text).toContain("rooms-overlap");
    expect(text).toContain("Rooms a and b overlap on floor ground");
  });
});
