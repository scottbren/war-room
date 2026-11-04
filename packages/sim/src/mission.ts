import type { FloorId, MapFile, Marker, Mission } from "@war-room/content";
import type { Rng } from "./rng";

/** The rolled facts of one run that are not entities. Truth: never shown to the player or to advisors directly. */
export interface MissionSetup {
  /** Clock time the raid starts, minutes after midnight. Omitted when the mission lists no options. */
  raidMinute?: number;
  /** Marker id of where the drive actually is. Omitted when the mission lists no options. */
  driveMarker?: string;
}

export interface MissionSpawn {
  id: string;
  side: "principal" | "family";
  floor: FloorId;
  x: number;
  y: number;
}

export interface MissionPlan {
  setup: MissionSetup;
  spawns: MissionSpawn[];
}

const MEMBERS = ["wife", "son", "daughter"] as const;

function marker(map: MapFile, id: string, why: string): Marker & { at: { x: number; y: number } } {
  const found = map.markers.find((m) => m.id === id);
  if (!found) throw new Error(`mission: ${why} names a marker that is not on the map: ${id}`);
  if (!found.at) throw new Error(`mission: ${why} names marker ${id}, which has no position`);
  return found as Marker & { at: { x: number; y: number } };
}

/**
 * Turns a mission into this run's starting facts, using only the seeded PRNG, in a fixed draw order:
 * raid time, principal start, drive location, then wife, son, daughter (presence, then any matching
 * routines in id order). Every list that is empty or missing draws nothing. Presence always draws,
 * so a probability of 0 or 1 does not change what later draws see.
 */
export function planMission(map: MapFile, mission: Mission, rng: Rng): MissionPlan {
  if (mission.mapId !== map.id) throw new Error(`mission ${mission.id} is for map ${mission.mapId}, not ${map.id}`);

  const setup: MissionSetup = {};
  const spawns: MissionSpawn[] = [];

  const times = mission.raidTimeOptions ?? [];
  if (times.length > 0) setup.raidMinute = rng.pick(times);

  if (mission.principalSpawnOptions.length > 0) {
    const m = marker(map, rng.pick(mission.principalSpawnOptions), "principalSpawnOptions");
    spawns.push({ id: "principal", side: "principal", floor: m.floor, x: m.at.x, y: m.at.y });
  }

  if (mission.driveLocationOptions.length > 0) {
    setup.driveMarker = marker(map, rng.pick(mission.driveLocationOptions), "driveLocationOptions").id;
  }

  const routines = [...(mission.routines ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const member of MEMBERS) {
    if (!(rng.nextFloat() < mission.familyPresence[member])) continue;
    let where: Marker & { at: { x: number; y: number } } | undefined;
    if (setup.raidMinute !== undefined) {
      for (const r of routines) {
        if (r.member !== member || setup.raidMinute < r.from || setup.raidMinute >= r.to) continue;
        if (rng.nextFloat() < r.probability) {
          where = marker(map, r.location, `routine ${r.id}`);
          break;
        }
      }
    }
    if (!where) {
      const home = map.markers.find((m) => m.tags.includes(`family:${member}`));
      if (!home) throw new Error(`mission: ${member} is present but the map has no family:${member} marker`);
      where = marker(map, home.id, `family:${member}`);
    }
    spawns.push({ id: `family.${member}`, side: "family", floor: where.floor, x: where.at.x, y: where.at.y });
  }

  return { setup, spawns };
}
