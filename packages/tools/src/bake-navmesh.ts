import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MapFile } from "@war-room/content";
import { exportNavMesh, init } from "@recast-navigation/core";
import { generateSoloNavMesh } from "@recast-navigation/generators";
import { buildNavGeometry } from "./navGeometry";

/**
 * 0.1 m voxels, agent radius 0.3 m (3 voxels), 1.8 m tall (18 voxels), climbs 0.4 m (4 voxels).
 * The design asked for 0.2 m voxels and a 0.35 m radius, but with those every 1.0-1.2 m doorway in the map
 * erodes shut (the wall faces already eat a voxel each side). See docs/decisions.md.
 */
export const NAV_CONFIG = {
  cs: 0.1,
  ch: 0.1,
  walkableSlopeAngle: 45,
  walkableHeight: 18,
  walkableClimb: 4,
  walkableRadius: 3,
  maxEdgeLen: 24,
  maxSimplificationError: 1.3,
  minRegionArea: 32,
  mergeRegionArea: 80,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
} as const;

export async function bakeNavmesh(map: MapFile): Promise<Uint8Array> {
  await init();
  const geo = buildNavGeometry(map);
  const result = generateSoloNavMesh(geo.positions, geo.indices, {
    ...NAV_CONFIG,
    offMeshConnections: geo.offMesh.map((c) => ({
      startPosition: { x: c.start[0], y: c.start[1], z: c.start[2] },
      endPosition: { x: c.end[0], y: c.end[1], z: c.end[2] },
      radius: 0.8,
      bidirectional: c.bidirectional,
    })),
  });
  if (!result.success) throw new Error(`navmesh bake failed: ${result.error}`);
  return exportNavMesh(result.navMesh);
}

const here = dirname(fileURLToPath(import.meta.url));
const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];
// Only the command line picks a map; importing this file always means CHARON.
const mapName = (isMain ? process.argv.slice(2).find((a) => a !== "--") : undefined) ?? "charon";
if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(mapName)) throw new Error(`Invalid map name "${mapName}"`);
const mapPath = `${here}/../../content/maps/${mapName}.json`;
export const navmeshPath = `${here}/../../content/generated/${mapName}.navmesh.bin`;

if (isMain) {
  const map = MapFile.parse(JSON.parse(readFileSync(mapPath, "utf8")));
  const started = Date.now();
  const data = await bakeNavmesh(map);
  mkdirSync(dirname(navmeshPath), { recursive: true });
  writeFileSync(navmeshPath, data);
  console.log(`Wrote ${mapName}.navmesh.bin (${data.length} bytes, ${Date.now() - started} ms)`);
}
