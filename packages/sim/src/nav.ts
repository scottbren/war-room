import { NavMeshQuery, importNavMesh, init } from "@recast-navigation/core";
import type { FloorId, MapFile } from "@war-room/content";
import { fromCm, toCm } from "./quantize";
import type { Pos } from "./types";

/**
 * Pathfinding on the baked CHARON navmesh (see tools/src/bake-navmesh.ts).
 * Recast axes: x = map x, y = height, z = map y. Floors that share a height (grounds/ground, hill/upper) are
 * told apart by which floor has a room under the point.
 * recast needs an async init(), so the nav object is built asynchronously and handed to the sim ready to use.
 */
export type Nav = {
  findPath(from: Pos, to: Pos): Pos[];
  /** True when the point is on the walkable mesh (within 12 cm). */
  isWalkable(pos: Pos): boolean;
};

const HALF_EXTENTS = { x: 1.5, y: 0.6, z: 1.5 };
const OUTDOOR: readonly FloorId[] = ["grounds", "shore", "hill"];

const dist2 = (dx: number, dz: number): number => Math.sqrt(dx * dx + dz * dz);
const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

let initPromise: Promise<void> | undefined;
const ensureInit = (): Promise<void> => {
  initPromise ??= init().catch((e: unknown) => {
    initPromise = undefined; // do not cache a failed init: let the next createNav retry
    throw e;
  });
  return initPromise;
};

export async function createNav(options: { data: Uint8Array; map: MapFile }): Promise<Nav> {
  await ensureInit();
  const { map } = options;
  const { navMesh } = importNavMesh(options.data);
  const query = new NavMeshQuery(navMesh);
  const elevation = new Map(map.floors.map((f) => [f.id, f.elevation]));

  const inRoom = (floor: FloorId, x: number, y: number): boolean =>
    map.floors.find((f) => f.id === floor)!.rooms.some((r) => x >= r.rect.min.x && x <= r.rect.max.x && y >= r.rect.min.y && y <= r.rect.max.y);

  /** The floor a mesh point belongs to: matching height, preferring the floor that has a room under the point. */
  const floorAt = (x: number, y: number, height: number): FloorId => {
    const candidates = map.floors.filter((f) => Math.abs(f.elevation - height) <= 0.6).sort((a, b) => Math.abs(a.elevation - height) - Math.abs(b.elevation - height) || (a.id < b.id ? -1 : 1));
    if (candidates.length === 0) throw new Error(`nav: path point at height ${height} matches no floor (navmesh does not match the map)`);
    const best = Math.abs(candidates[0]!.elevation - height);
    const level = candidates.filter((f) => Math.abs(Math.abs(f.elevation - height) - best) < 1e-9 || Math.abs(f.elevation - candidates[0]!.elevation) < 1e-9);
    const indoor = level.find((f) => !OUTDOOR.includes(f.id) && inRoom(f.id, x, y));
    if (indoor) return indoor.id;
    return (level.find((f) => OUTDOOR.includes(f.id)) ?? level[0]!).id;
  };

  return {
    isWalkable(pos) {
      const r = query.findClosestPoint({ x: pos.x, y: elevation.get(pos.floor)!, z: pos.y }, { halfExtents: { x: 0.2, y: 0.6, z: 0.2 } });
      return r.success && dist2(r.point.x - pos.x, r.point.z - pos.y) < 0.12;
    },
    findPath(from, to) {
      const a = { x: from.x, y: elevation.get(from.floor)!, z: from.y };
      const b = { x: to.x, y: elevation.get(to.floor)!, z: to.y };
      const result = query.computePath(a, b, { halfExtents: HALF_EXTENTS, maxPathPolys: 4096, maxStraightPathPoints: 1024 });
      if (!result.success || result.path.length === 0) return [];
      // A partial path ends at the closest reachable point; treat that as "no route".
      const goal = query.findClosestPoint(b, { halfExtents: HALF_EXTENTS });
      const last = result.path[result.path.length - 1]!;
      if (!goal.success || dist3(goal.point, last) > 0.3) return [];
      return result.path.map((p) => ({ floor: floorAt(p.x, p.z, p.y), x: fromCm(toCm(p.x)), y: fromCm(toCm(p.z)) }));
    },
  };
}
