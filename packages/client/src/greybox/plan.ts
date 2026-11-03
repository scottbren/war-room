import type { Floor, FloorId, MapFile, Zone } from "@war-room/content";

/**
 * Greybox plan: turns map data into a flat list of boxes. Pure data, no Babylon,
 * so it can be tested without a GPU.
 *
 * Coordinates: map (x east, y north, z up) becomes Babylon (x, z, y), so a box's
 * `center` and `size` are [x, up, depth] where depth runs along map y.
 */

export type ZoneKind = Zone["kind"];

export type MaterialKey =
  | "terrain"
  | "slab"
  | "wall:reinforced"
  | "wall:stone"
  | "wall:plaster"
  | "wall:glass"
  | "wall:perimeter"
  | "cover:heavy"
  | "cover:light"
  | "cover:concealment"
  | `zone:${ZoneKind}`;

export interface Material {
  /** Linear RGB, 0-1. */
  color: readonly [number, number, number];
  alpha: number;
}

export const MATERIALS: Record<MaterialKey, Material> = {
  terrain: { color: [0.18, 0.22, 0.16], alpha: 1 },
  slab: { color: [0.45, 0.45, 0.47], alpha: 1 },
  "wall:reinforced": { color: [0.35, 0.37, 0.42], alpha: 1 },
  "wall:stone": { color: [0.55, 0.52, 0.47], alpha: 1 },
  "wall:plaster": { color: [0.82, 0.8, 0.75], alpha: 1 },
  "wall:glass": { color: [0.6, 0.8, 0.9], alpha: 0.35 },
  "wall:perimeter": { color: [0.3, 0.3, 0.32], alpha: 1 },
  // Cover: heavy blue-grey, light amber, concealment green and see-through.
  "cover:heavy": { color: [0.3, 0.38, 0.52], alpha: 1 },
  "cover:light": { color: [0.85, 0.62, 0.18], alpha: 1 },
  "cover:concealment": { color: [0.2, 0.55, 0.25], alpha: 0.5 },
  "zone:exposed": { color: [0.76, 0.68, 0.48], alpha: 0.5 },
  "zone:pool": { color: [0.2, 0.7, 0.85], alpha: 0.6 },
  "zone:garden": { color: [0.15, 0.45, 0.2], alpha: 0.5 },
  "zone:marina": { color: [0.2, 0.5, 0.55], alpha: 0.5 },
  "zone:sea": { color: [0.05, 0.2, 0.4], alpha: 0.6 },
  "zone:road": { color: [0.2, 0.2, 0.22], alpha: 0.8 },
  "zone:lawn": { color: [0.3, 0.6, 0.25], alpha: 0.5 },
  "zone:terrace": { color: [0.7, 0.65, 0.58], alpha: 0.6 },
};

export interface Box {
  id: string;
  floor: FloorId;
  material: MaterialKey;
  /** Babylon [x, up, depth]. */
  center: readonly [number, number, number];
  /** Babylon [width, height, depth]. */
  size: readonly [number, number, number];
}

const SLAB_THICKNESS = 0.2;
const ZONE_THICKNESS = 0.04;
const TERRAIN_THICKNESS = 0.2;
const TERRAIN_TOP = -0.05;
const EDGE_EPS = 1e-6;

const ZONE_ORDER: readonly ZoneKind[] = ["exposed", "lawn", "terrace", "garden", "road", "marina", "pool", "sea"];

/** Axis-aligned map rectangle to a box standing on `elevation`. */
function rectBox(
  rect: { min: { x: number; y: number }; max: { x: number; y: number } },
  baseY: number,
  height: number,
): Pick<Box, "center" | "size"> {
  const w = rect.max.x - rect.min.x;
  const d = rect.max.y - rect.min.y;
  return {
    center: [(rect.min.x + rect.max.x) / 2, baseY + height / 2, (rect.min.y + rect.max.y) / 2],
    size: [w, height, d],
  };
}

/** True if a door or window gap starts or stops exactly at this point of the wall's line. */
function endsAtGap(floor: Floor, vertical: boolean, line: number, end: number): boolean {
  return [...floor.doors, ...floor.windows].some((item) => {
    const across = vertical ? item.at.x : item.at.y;
    const along = vertical ? item.at.y : item.at.x;
    return (
      across === line &&
      (Math.abs(along - item.width / 2 - end) < EDGE_EPS || Math.abs(along + item.width / 2 - end) < EDGE_EPS)
    );
  });
}

function wallBox(floor: Floor, w: Floor["walls"][number]): Box {
  const vertical = w.a.x === w.b.x;
  const line = vertical ? w.a.x : w.a.y;
  let lo = Math.min(vertical ? w.a.y : w.a.x, vertical ? w.b.y : w.b.x);
  let hi = Math.max(vertical ? w.a.y : w.a.x, vertical ? w.b.y : w.b.x);
  // Close the corners, except where a door gap begins.
  if (!endsAtGap(floor, vertical, line, lo)) lo -= w.thickness / 2;
  if (!endsAtGap(floor, vertical, line, hi)) hi += w.thickness / 2;
  const length = hi - lo;
  const mid = (lo + hi) / 2;
  const y = floor.elevation + w.height / 2;
  return {
    id: `wall:${w.id}`,
    floor: floor.id,
    material: `wall:${w.material}`,
    center: vertical ? [line, y, mid] : [mid, y, line],
    size: vertical ? [w.thickness, w.height, length] : [length, w.height, w.thickness],
  };
}

export function planGreybox(map: MapFile): Box[] {
  const boxes: Box[] = [];
  const elevationOf = new Map<FloorId, number>(map.floors.map((f) => [f.id, f.elevation]));

  // One terrain plane under the whole map.
  boxes.push({
    id: "terrain",
    floor: "grounds",
    material: "terrain",
    ...rectBox(map.bounds, TERRAIN_TOP - TERRAIN_THICKNESS, TERRAIN_THICKNESS),
  });

  // Zone overlays: thin translucent slabs, each kind a hair higher than the last so overlaps do not flicker.
  for (const zone of map.zones) {
    const lift = 0.02 + ZONE_ORDER.indexOf(zone.kind) * 0.004;
    const base = (elevationOf.get(zone.floor) ?? 0) + lift - ZONE_THICKNESS / 2;
    boxes.push({
      id: `zone:${zone.id}`,
      floor: zone.floor,
      material: `zone:${zone.kind}`,
      ...rectBox(zone.rect, base, ZONE_THICKNESS),
    });
  }

  for (const floor of map.floors) {
    // Floor slabs, top surface at the floor's elevation. The gallery void is open air: no slab.
    for (const room of floor.rooms) {
      if (room.tags.includes("void")) continue;
      boxes.push({
        id: `slab:${room.id}`,
        floor: floor.id,
        material: "slab",
        ...rectBox(room.rect, floor.elevation - SLAB_THICKNESS, SLAB_THICKNESS),
      });
    }
    for (const wall of floor.walls) boxes.push(wallBox(floor, wall));
    for (const cover of floor.cover) {
      boxes.push({
        id: `cover:${cover.id}`,
        floor: floor.id,
        material: `cover:${cover.type}`,
        ...rectBox(cover.rect, floor.elevation, cover.height),
      });
    }
  }
  return boxes;
}

export interface BoxGroup {
  /** "<floor>|<material>", unique, used for mesh names. */
  key: string;
  floor: FloorId;
  material: MaterialKey;
  boxes: Box[];
}

/** Groups boxes by floor and material (one merged mesh each), sorted by key. */
export function groupBoxes(boxes: readonly Box[]): BoxGroup[] {
  const groups = new Map<string, BoxGroup>();
  for (const box of boxes) {
    const key = `${box.floor}|${box.material}`;
    const group = groups.get(key);
    if (group) group.boxes.push(box);
    else groups.set(key, { key, floor: box.floor, material: box.material, boxes: [box] });
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export type FloorVisibility = Record<FloorId, boolean>;

/** Keys 1-4 show and hide the grounds, ground floor, upper floor and roof. */
export const FLOOR_KEYS = { "1": "grounds", "2": "ground", "3": "upper", "4": "roof" } as const satisfies Record<string, FloorId>;

export function toggleFloor(visibility: FloorVisibility, floor: FloorId): FloorVisibility {
  return { ...visibility, [floor]: !visibility[floor] };
}
