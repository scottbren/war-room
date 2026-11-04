import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MapFile, Mission } from "@war-room/content";

/** Checks a mission against its map: every marker it names exists, has a position and is the right kind of marker. */
export function validateMission(mission: Mission, map: MapFile): string[] {
  const issues: string[] = [];
  const find = (id: string) => map.markers.find((m) => m.id === id);
  const needs = (id: string, why: string, tag?: string): void => {
    const m = find(id);
    if (!m) issues.push(`${why}: marker ${id} is not on the map`);
    else if (!m.at) issues.push(`${why}: marker ${id} has no position`);
    else if (tag !== undefined && !m.tags.includes(tag)) issues.push(`${why}: marker ${id} should be tagged ${tag}`);
  };
  if (mission.mapId !== map.id) issues.push(`mission ${mission.id} is for map ${mission.mapId}, not ${map.id}`);
  for (const id of mission.principalSpawnOptions) needs(id, "principalSpawnOptions");
  for (const id of mission.driveLocationOptions) needs(id, "driveLocationOptions");
  for (const member of ["wife", "son", "daughter"] as const) {
    if (mission.familyPresence[member] > 0 && !map.markers.some((m) => m.tags.includes(`family:${member}`))) {
      issues.push(`familyPresence: ${member} can be present but the map has no family:${member} marker`);
    }
  }
  const ids = new Set<string>();
  for (const r of mission.routines ?? []) {
    if (ids.has(r.id)) issues.push(`routine ${r.id} appears twice`);
    ids.add(r.id);
    needs(r.location, `routine ${r.id}`, `member:${r.member}`);
    const spot = find(r.location);
    if (spot && !spot.tags.some((t) => t.startsWith("routine:"))) issues.push(`routine ${r.id}: marker ${r.location} should have a routine:<activity> tag`);
  }
  if ((mission.routines ?? []).length > 0 && (mission.raidTimeOptions ?? []).length === 0) issues.push("routines are set but raidTimeOptions is empty, so no routine can ever apply");
  return issues;
}

function main(): void {
  const name = process.argv.slice(2).find((a) => a !== "--") ?? "charon";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new Error(`Invalid name "${name}"`);
  const read = (dir: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../content/${dir}/${name}.json`, import.meta.url)), "utf8")) as unknown;
  const issues = validateMission(Mission.parse(read("missions")), MapFile.parse(read("maps")));
  console.log(issues.length === 0 ? `OK mission ${name}: no problems found` : issues.map((i) => `- ${i}`).join("\n"));
  if (issues.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
