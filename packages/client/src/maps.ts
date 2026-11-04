import charonJson from "../../content/maps/charon.json";
import testbedJson from "../../content/maps/testbed.json";
import charonNavmeshUrl from "../../content/generated/charon.navmesh.bin?url";
import testbedNavmeshUrl from "../../content/generated/testbed.navmesh.bin?url";

/** The maps the client can show. CHARON is the game map; TESTBED is a small dev fixture (open `/?map=testbed`). */
export const MAPS = {
  charon: { json: charonJson, navmeshUrl: charonNavmeshUrl },
  testbed: { json: testbedJson, navmeshUrl: testbedNavmeshUrl },
} as const;

export type MapName = keyof typeof MAPS;

export function isMapName(name: string | null | undefined): name is MapName {
  return name === "charon" || name === "testbed";
}

/** `?map=testbed` picks the dev map; anything else is CHARON. */
export function mapNameFromSearch(search: string): MapName {
  const name = new URLSearchParams(search).get("map");
  return isMapName(name) ? name : "charon";
}
