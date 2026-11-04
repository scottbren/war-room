import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile, Mission } from "@war-room/content";
import { createSim } from "@war-room/sim";
import { validateMission } from "../src/validate-mission";

const read = (rel: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const charon = MapFile.parse(read("../../content/maps/charon.json"));
const testbed = MapFile.parse(read("../../content/maps/testbed.json"));
const charonMission = Mission.parse(read("../../content/missions/charon.json"));
const testbedMission = Mission.parse(read("../../content/missions/testbed.json"));

const setupOf = (sim: ReturnType<typeof createSim>): { raidMinute?: number; driveMarker?: string } => (JSON.parse(sim.serialize()) as { setup: { raidMinute?: number; driveMarker?: string } }).setup;
const family = (sim: ReturnType<typeof createSim>) => sim.step().snapshot.entities.filter((e) => e.side === "principal" || e.side === "family");

describe("mission files", () => {
  it("are valid against their maps", () => {
    expect(validateMission(charonMission, charon)).toEqual([]);
    expect(validateMission(testbedMission, testbed)).toEqual([]);
  });

  it("the validator names what is wrong", () => {
    const bad: Mission = {
      ...testbedMission,
      mapId: "charon",
      principalSpawnOptions: ["m.nobody"],
      driveLocationOptions: ["m.spawn.def1"].concat(["m.also-missing"]),
      routines: [{ id: "routine.wife.lounge", member: "son", from: 10, to: 20, location: "m.routine.wife.hall", probability: 1 }],
    };
    const issues = validateMission(bad, testbed).join("\n");
    expect(issues).toContain("is for map charon, not testbed");
    expect(issues).toContain("principalSpawnOptions: marker m.nobody is not on the map");
    expect(issues).toContain("driveLocationOptions: marker m.also-missing is not on the map");
    expect(issues).toContain("should be tagged member:son");
  });
});

describe("a sim created with a mission", () => {
  it("is deterministic: the same seed gives the same start and the same hash", () => {
    const a = createSim({ seed: 9, map: charon, mission: charonMission });
    const b = createSim({ seed: 9, map: charon, mission: charonMission });
    expect(a.hash()).toBe(b.hash());
    expect(setupOf(a)).toEqual(setupOf(b));
    expect(family(a)).toEqual(family(b));
  });

  it("varies with the seed over the options the mission lists, and only those", () => {
    const times = new Set<number>(), principals = new Set<string>(), drives = new Set<string>(), floors = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const sim = createSim({ seed, map: charon, mission: charonMission });
      const s = setupOf(sim);
      times.add(s.raidMinute!);
      drives.add(s.driveMarker!);
      for (const e of family(sim)) {
        if (e.id === "principal") principals.add(`${e.pos.floor}:${e.pos.x},${e.pos.y}`);
        floors.add(`${e.id}@${e.pos.floor}`);
      }
    }
    expect([...times].sort((x, y) => x - y)).toEqual([60, 180, 1380]);
    expect([...drives].sort()).toEqual(["m.drive.office-safe", "m.drive.study-desk"]);
    expect(principals.size).toBe(2);
    expect(floors.has("family.wife@lower"), "the wife is sometimes at the spa").toBe(true);
    expect(floors.has("family.wife@upper"), "and sometimes in her suite").toBe(true);
    expect(floors.has("family.daughter@lower"), "the daughter is sometimes in the gym").toBe(true);
  });

  it("brings family by their presence odds: certain, never", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const ids = family(createSim({ seed, map: testbed, mission: testbedMission })).map((e) => e.id);
      expect(ids).toEqual(["family.wife", "principal"]);
    }
  });

  it("puts the wife on her routine spot inside its window, and in her room outside it", () => {
    const seen = new Map<number, string>();
    for (let seed = 1; seed <= 30; seed++) {
      const sim = createSim({ seed, map: testbed, mission: testbedMission });
      const wife = family(sim).find((e) => e.id === "family.wife")!;
      seen.set(setupOf(sim).raidMinute!, `${wife.pos.floor}:${wife.pos.x},${wife.pos.y}`);
    }
    expect(seen.get(1260)).toBe("ground:15.5,7.5"); // 21:00 is inside 20:00 to 22:00, probability 1
    expect(seen.get(180)).toBe("upper:21,10"); // 03:00 is outside it: her bedroom marker
  });

  it("keeps the rolled facts out of the snapshot (truth, not knowledge)", () => {
    const snap = createSim({ seed: 3, map: charon, mission: charonMission }).step().snapshot;
    expect(Object.keys(snap).sort()).toEqual(["alert", "devices", "doors", "entities", "hubOnline", "shutters", "tick"]);
  });

  it("survives serialize and restore, and the restored copy keeps the same setup and hash", () => {
    const sim = createSim({ seed: 5, map: testbed, mission: testbedMission });
    for (let i = 0; i < 5; i++) sim.step();
    const text = sim.serialize();
    const copy = createSim({ seed: 1, map: testbed });
    copy.restore(text);
    expect(copy.hash()).toBe(sim.hash());
    expect(setupOf(copy)).toEqual(setupOf(sim));
  });

  it("rejects a mission for another map, and a corrupt saved setup", () => {
    expect(() => createSim({ seed: 1, map: testbed, mission: charonMission })).toThrow(/is for map charon, not testbed/);
    const good = JSON.parse(createSim({ seed: 5, map: testbed, mission: testbedMission }).serialize()) as { setup: Record<string, unknown> };
    good.setup["driveMarker"] = "m.not-there";
    expect(() => createSim({ seed: 1, map: testbed }).restore(JSON.stringify(good))).toThrow(/invalid drive marker/);
    good.setup["driveMarker"] = "m.drive.study-desk";
    good.setup["extra"] = 1;
    expect(() => createSim({ seed: 1, map: testbed }).restore(JSON.stringify(good))).toThrow(/unknown fields/);
  });

  it("changes nothing for a sim created without a mission (no setup in the state)", () => {
    const sim = createSim({ seed: 1, map: testbed });
    expect(JSON.parse(sim.serialize())).not.toHaveProperty("setup");
    expect(sim.step().snapshot.entities.map((e) => e.side).sort()).toEqual(["defender", "defender", "defender", "operator", "operator"]);
  });
});
