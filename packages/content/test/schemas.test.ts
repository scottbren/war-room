import { describe, expect, it } from "vitest";
import {
  Complication,
  DecisionCard,
  Equipment,
  MapFile,
  Mission,
  Team,
  UnitType,
} from "../src";

const rect = { min: { x: 0, y: 0 }, max: { x: 4, y: 3 } };

const validMap = {
  id: "test",
  version: 1,
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  floors: [
    {
      id: "ground",
      elevation: 0,
      rooms: [{ id: "g.a", name: "A", rect, ceiling: 3, tags: ["interior"] }],
      walls: [
        {
          id: "w1",
          a: { x: 0, y: 0 },
          b: { x: 4, y: 0 },
          thickness: 0.2,
          height: 3,
          material: "plaster",
          destructible: true,
        },
      ],
      doors: [
        {
          id: "d1",
          at: { x: 2, y: 0 },
          width: 1,
          between: ["g.a", "outside"],
          kind: "standard",
          state: "closed",
          breach: ["manual"],
        },
      ],
      windows: [],
      openings: [],
      cover: [{ id: "c1", rect, type: "light", height: 1, facing: "all", destructible: true }],
    },
  ],
  verticalLinks: [],
  zones: [{ id: "z1", floor: "ground", rect, kind: "lawn" }],
  markers: [{ id: "m1", floor: "ground", kind: "spawn", at: { x: 1, y: 1 }, tags: [] }],
};

const validUnit = {
  id: "op",
  side: "operator",
  speed: 1.5,
  health: 100,
  sightRange: 20,
  nightVision: true,
};

const validMission = {
  id: "charon",
  mapId: "charon",
  seedPolicy: "random",
  principalSpawnOptions: ["m1"],
  driveLocationOptions: ["m2"],
  familyPresence: { wife: 0.5, son: 1, daughter: 0 },
  complicationPool: ["c1"],
  complicationsPerRun: [1, 2],
};

const validCard = {
  id: "card1",
  title: "Hold or go",
  trigger: { event: "contact", conditions: [{ path: "tick", op: "gt", value: 5 }] },
  reserved: false,
  defaultOptionId: "go",
  options: [{ id: "go", label: "Go", effects: [{ kind: "proceed", params: {} }] }],
};

const validComplication = {
  id: "comp1",
  title: "Dog barks",
  setup: [],
  trigger: { event: "arrived", conditions: [] },
  effects: [{ kind: "alert", params: { amount: 1 } }],
};

describe("MapFile", () => {
  it("accepts a minimal valid map", () => {
    expect(MapFile.safeParse(validMap).success).toBe(true);
  });
  it("rejects a rect whose min exceeds max", () => {
    const bad = { ...validMap, bounds: { min: { x: 5, y: 0 }, max: { x: 1, y: 1 } } };
    expect(MapFile.safeParse(bad).success).toBe(false);
  });
  it("rejects an unknown floor id", () => {
    const bad = { ...validMap, floors: [{ ...validMap.floors[0], id: "basement" }] };
    expect(MapFile.safeParse(bad).success).toBe(false);
  });
});

describe("VerticalLink restrictedTo", () => {
  const link = {
    id: "l1",
    kind: "shaft",
    from: { floor: "upper", at: { x: 1, y: 1 } },
    to: { floor: "ground", at: { x: 1, y: 1 } },
    bidirectional: false,
  };
  const withMap = (restrictedTo: unknown) => ({ ...validMap, verticalLinks: [{ ...link, restrictedTo }] });

  it("accepts principal and family (approved contract change)", () => {
    expect(MapFile.safeParse(withMap(["principal", "family"])).success).toBe(true);
  });
  it("still rejects unknown roles", () => {
    expect(MapFile.safeParse(withMap(["alien"])).success).toBe(false);
  });
});

describe("UnitType / Team / Equipment", () => {
  it("accepts valid examples", () => {
    expect(UnitType.safeParse(validUnit).success).toBe(true);
    expect(Team.safeParse({ id: "alpha", name: "Alpha", side: "operator", members: ["op.alpha.1"] }).success).toBe(true);
    expect(Equipment.safeParse({ id: "nvg", name: "NVG", kind: "optic", effects: { nightVision: 1 } }).success).toBe(true);
  });
  it("rejects a unit with a bad side", () => {
    expect(UnitType.safeParse({ ...validUnit, side: "alien" }).success).toBe(false);
  });
  it("rejects a unit with non-positive speed", () => {
    expect(UnitType.safeParse({ ...validUnit, speed: 0 }).success).toBe(false);
  });
  it("rejects a team with no name", () => {
    expect(Team.safeParse({ id: "alpha", name: "", side: "operator", members: [] }).success).toBe(false);
  });
  it("rejects equipment with non-numeric effects", () => {
    expect(Equipment.safeParse({ id: "x", name: "X", kind: "k", effects: { a: "b" } }).success).toBe(false);
  });
});

describe("Mission", () => {
  it("accepts a valid mission", () => {
    expect(Mission.safeParse(validMission).success).toBe(true);
  });
  it("rejects a probability above 1", () => {
    const bad = { ...validMission, familyPresence: { wife: 1.5, son: 0, daughter: 0 } };
    expect(Mission.safeParse(bad).success).toBe(false);
  });
  it("rejects an inverted complicationsPerRun range", () => {
    expect(Mission.safeParse({ ...validMission, complicationsPerRun: [3, 1] }).success).toBe(false);
  });
});

describe("DecisionCard / Complication", () => {
  it("accepts valid examples", () => {
    expect(DecisionCard.safeParse(validCard).success).toBe(true);
    expect(Complication.safeParse(validComplication).success).toBe(true);
  });
  it("rejects a card whose default option does not exist", () => {
    expect(DecisionCard.safeParse({ ...validCard, defaultOptionId: "nope" }).success).toBe(false);
  });
  it("rejects a card with no options", () => {
    expect(DecisionCard.safeParse({ ...validCard, options: [] }).success).toBe(false);
  });
  it("rejects a condition with an unknown operator", () => {
    const bad = {
      ...validComplication,
      trigger: { event: "x", conditions: [{ path: "a", op: "like", value: 1 }] },
    };
    expect(Complication.safeParse(bad).success).toBe(false);
  });
});

describe("Door hidden flag (approved contract change, 2026-11-04)", () => {
  const door = { id: "d1", at: { x: 2, y: 0 }, width: 1, between: ["g.a", "outside"], kind: "standard", state: "closed", breach: ["manual"] };
  const withDoor = (extra: Record<string, unknown>) => ({ ...validMap, floors: [{ ...validMap.floors[0], doors: [{ ...door, ...extra }] }] });

  it("is optional, so every existing door stays valid", () => {
    expect(MapFile.safeParse(withDoor({})).success).toBe(true);
  });
  it("accepts true and false", () => {
    expect(MapFile.safeParse(withDoor({ hidden: true })).success).toBe(true);
    expect(MapFile.safeParse(withDoor({ hidden: false })).success).toBe(true);
  });
  it("rejects anything that is not a boolean", () => {
    expect(MapFile.safeParse(withDoor({ hidden: "yes" })).success).toBe(false);
    expect(MapFile.safeParse(withDoor({ hidden: 1 })).success).toBe(false);
  });
});

describe("Mission routines (approved contract change, 2026-11-04)", () => {
  const routine = { id: "r.wife.spa", member: "wife", from: 21 * 60, to: 22 * 60 + 30, location: "m.routine.wife.spa", probability: 0.6 };
  const withRoutines = (routines: unknown, raidTimeOptions: unknown = [21 * 60 + 30]) => ({ ...validMission, raidTimeOptions, routines });

  it("stays valid without routines or a raid clock", () => {
    expect(Mission.safeParse(validMission).success).toBe(true);
  });
  it("accepts a routine and the raid times it is checked against", () => {
    expect(Mission.safeParse(withRoutines([routine])).success).toBe(true);
  });
  it("only allows the three family members", () => {
    expect(Mission.safeParse(withRoutines([{ ...routine, member: "father" }])).success).toBe(false);
  });
  it("needs a window inside one day that starts before it ends", () => {
    expect(Mission.safeParse(withRoutines([{ ...routine, from: 600, to: 600 }])).success).toBe(false);
    expect(Mission.safeParse(withRoutines([{ ...routine, from: 700, to: 600 }])).success).toBe(false);
    expect(Mission.safeParse(withRoutines([{ ...routine, to: 1440 }])).success).toBe(false);
    expect(Mission.safeParse(withRoutines([{ ...routine, from: -1 }])).success).toBe(false);
    expect(Mission.safeParse(withRoutines([{ ...routine, from: 600.5 }])).success).toBe(false);
  });
  it("keeps the probability between 0 and 1 and rejects unknown fields", () => {
    expect(Mission.safeParse(withRoutines([{ ...routine, probability: 1.2 }])).success).toBe(false);
    expect(Mission.safeParse(withRoutines([{ ...routine, mood: "tired" }])).success).toBe(false);
  });
  it("rejects a raid time outside the day", () => {
    expect(Mission.safeParse(withRoutines([routine], [1440])).success).toBe(false);
    expect(Mission.safeParse(withRoutines([routine], [-5])).success).toBe(false);
  });
});
