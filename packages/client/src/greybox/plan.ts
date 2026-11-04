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
  | "slab:deck"
  | "stairs"
  | "stairs:spine"
  | "window:glass"
  | "window:slit"
  | "window:shutter"
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
  "slab:deck": { color: [0.62, 0.52, 0.4], alpha: 1 }, // open decks and terraces: warm timber and stone
  stairs: { color: [0.78, 0.74, 0.66], alpha: 1 }, // pale marble
  "stairs:spine": { color: [0.2, 0.21, 0.24], alpha: 1 }, // dark steel carrying a floating flight
  "window:glass": { color: [0.55, 0.75, 0.9], alpha: 0.4 }, // blast-rated glazing
  "window:slit": { color: [0.1, 0.14, 0.18], alpha: 0.85 }, // narrow firing/light slit
  "window:shutter": { color: [0.25, 0.27, 0.3], alpha: 1 }, // steel shutter housing
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

// Drawn bottom to top, so a path (terrace) over a garden shows, and a pond (pool) over both.
const ZONE_ORDER: readonly ZoneKind[] = ["exposed", "lawn", "garden", "terrace", "road", "marina", "pool", "sea"];

/** Draw rank of a zone material (0 = bottom layer), or undefined for anything that is not a zone. */
export function zoneRank(material: MaterialKey): number | undefined {
  if (!material.startsWith("zone:")) return undefined;
  return ZONE_ORDER.indexOf(material.slice("zone:".length) as ZoneKind);
}

// Window panes stand in solid wall (windows never cut the wall). Wide windows are armored
// glazing with a steel shutter housing over them; narrow ones (<= 0.5 m) are slits.
const SLIT_MAX_WIDTH = 0.5;
const GLASS_SILL = 0.9;
const GLASS_HEIGHT = 1.4;
const SLIT_SILL = 1.2;
const SLIT_HEIGHT = 0.6;
const PANE_PROUD = 0.1; // the pane sticks out this much past the wall faces, in total
const SHUTTER_HEIGHT = 0.3;

const STAIR_WIDTH = 3;
const STAIR_STEP_RISE = 0.25;
// A floating flight (the grand stairs): thin open treads on a narrow steel spine, with a glass balustrade down each side.
const FLOATING_STAIR_PREFIX = "link.grand-stairs.";
const FLOATING_WIDTH = 3.6;
const TREAD_THICKNESS = 0.14;
const SPINE_WIDTH = 0.3;
const SPINE_DEPTH = 0.45; // how far the spine hangs under a tread
const SPINE_CLEARANCE = 0.06; // and it never gets closer than this to the floor
const GLASS_RAIL_HEIGHT = 1;
const GLASS_RAIL_THICKNESS = 0.04;

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

/** A box on a stair flight: `along` is the flight's axis ("x" or "y" on the map), positions in map metres. */
function flightBox(along: "x" | "y", alongMid: number, acrossMid: number, bottom: number, top: number, alongSize: number, acrossSize: number): Pick<Box, "center" | "size"> {
  const height = top - bottom;
  return along === "y"
    ? { center: [acrossMid, bottom + height / 2, alongMid], size: [acrossSize, height, alongSize] }
    : { center: [alongMid, bottom + height / 2, acrossMid], size: [alongSize, height, acrossSize] };
}

/**
 * A stairs link as a solid stepped flight, centered on the line between its two ends.
 * Only axis-aligned flights with a real horizontal run are drawn (a link that goes
 * straight up, like the service stair, has nothing to draw yet).
 */
function stairBoxes(link: MapFile["verticalLinks"][number], elevationOf: Map<FloorId, number>): Box[] {
  const [lo, hi] = [link.from, link.to].sort((a, b) => (elevationOf.get(a.floor) ?? 0) - (elevationOf.get(b.floor) ?? 0)) as [
    MapFile["verticalLinks"][number]["from"],
    MapFile["verticalLinks"][number]["from"],
  ];
  const base = elevationOf.get(lo.floor) ?? 0;
  const rise = (elevationOf.get(hi.floor) ?? 0) - base;
  const dx = hi.at.x - lo.at.x;
  const dy = hi.at.y - lo.at.y;
  const run = Math.abs(dx) + Math.abs(dy);
  if (rise <= 0 || run < 2 || (dx !== 0 && dy !== 0)) return [];

  const n = Math.ceil(rise / STAIR_STEP_RISE);
  const stepRun = run / n;
  const along = dx !== 0 ? "x" : "y";
  const sign = (dx !== 0 ? dx : dy) > 0 ? 1 : -1;
  const boxes: Box[] = [];
  if (link.id.startsWith(FLOATING_STAIR_PREFIX)) {
    const across = along === "x" ? lo.at.y : lo.at.x;
    const sideOffset = (FLOATING_WIDTH - GLASS_RAIL_THICKNESS) / 2;
    for (let i = 0; i < n; i++) {
      const top = base + ((i + 1) * rise) / n;
      const nn = String(i).padStart(2, "0");
      const mid = (along === "x" ? lo.at.x : lo.at.y) + sign * (i * stepRun + stepRun / 2);
      boxes.push({ id: `stairs:${link.id}:${nn}`, floor: lo.floor, material: "stairs", ...flightBox(along, mid, across, top - TREAD_THICKNESS, top, stepRun, FLOATING_WIDTH) });
      const spineBottom = Math.max(base + SPINE_CLEARANCE, top - TREAD_THICKNESS - SPINE_DEPTH);
      boxes.push({ id: `spine:${link.id}:${nn}`, floor: lo.floor, material: "stairs:spine", ...flightBox(along, mid, across, spineBottom, top - TREAD_THICKNESS, stepRun, SPINE_WIDTH) });
      for (const [side, sign2] of [["a", -1], ["b", 1]] as const) {
        boxes.push({ id: `rail:${link.id}:${side}:${nn}`, floor: lo.floor, material: "window:glass", ...flightBox(along, mid, across + sign2 * sideOffset, top, top + GLASS_RAIL_HEIGHT, stepRun, GLASS_RAIL_THICKNESS) });
      }
    }
    return boxes;
  }
  for (let i = 0; i < n; i++) {
    const height = ((i + 1) * rise) / n;
    const start = (along === "x" ? lo.at.x : lo.at.y) + sign * i * stepRun;
    const mid = start + (sign * stepRun) / 2;
    boxes.push({
      id: `stairs:${link.id}:${String(i).padStart(2, "0")}`,
      floor: lo.floor,
      material: "stairs",
      center: along === "y" ? [lo.at.x, base + height / 2, mid] : [mid, base + height / 2, lo.at.y],
      size: along === "y" ? [STAIR_WIDTH, height, stepRun] : [stepRun, height, STAIR_WIDTH],
    });
  }
  return boxes;
}

/** Pane (and shutter housing) for one window, standing in the wall that contains it. */
function windowBoxes(floor: Floor, w: Floor["windows"][number]): Box[] {
  const wall = floor.walls.find((x) => {
    const vertical = x.a.x === x.b.x;
    const line = vertical ? x.a.x : x.a.y;
    const across = vertical ? w.at.x : w.at.y;
    const along = vertical ? w.at.y : w.at.x;
    const lo = Math.min(vertical ? x.a.y : x.a.x, vertical ? x.b.y : x.b.x) - w.width / 2;
    const hi = Math.max(vertical ? x.a.y : x.a.x, vertical ? x.b.y : x.b.x) + w.width / 2;
    return across === line && along >= lo && along <= hi;
  });
  if (!wall) return [];
  const vertical = wall.a.x === wall.b.x;
  const slit = w.width <= SLIT_MAX_WIDTH;
  const sill = slit ? SLIT_SILL : GLASS_SILL;
  const height = slit ? SLIT_HEIGHT : GLASS_HEIGHT;
  const place = (y: number, h: number, thickness: number, width: number): Pick<Box, "center" | "size"> => ({
    center: [w.at.x, floor.elevation + y + h / 2, w.at.y],
    size: vertical ? [thickness, h, width] : [width, h, thickness],
  });
  const boxes: Box[] = [
    { id: `window:${w.id}`, floor: floor.id, material: slit ? "window:slit" : "window:glass", ...place(sill, height, wall.thickness + PANE_PROUD, w.width) },
  ];
  if (w.shutter) {
    boxes.push({
      id: `shutter:${w.id}`,
      floor: floor.id,
      material: "window:shutter",
      ...place(sill + height, SHUTTER_HEIGHT, wall.thickness + PANE_PROUD * 2, w.width + 0.2),
    });
  }
  return boxes;
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

  // The hill floor is raised ground: a solid block under each of its zones, so the neighbor villas stand on earth, not in the air.
  for (const zone of map.zones) {
    const top = (elevationOf.get(zone.floor) ?? 0) - 0.01;
    if (zone.floor !== "hill" || top <= TERRAIN_TOP) continue;
    boxes.push({
      id: `plinth:${zone.id}`,
      floor: zone.floor,
      material: "terrain",
      ...rectBox(zone.rect, TERRAIN_TOP, top - TERRAIN_TOP),
    });
  }

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

  for (const link of map.verticalLinks) {
    if (link.kind === "stairs") boxes.push(...stairBoxes(link, elevationOf));
  }

  for (const floor of map.floors) {
    // Floor slabs, top surface at the floor's elevation. The gallery void is open air: no slab.
    for (const room of floor.rooms) {
      if (room.tags.includes("void")) continue;
      boxes.push({
        id: `slab:${room.id}`,
        floor: floor.id,
        material: room.tags.includes("deck") || room.tags.includes("terrace") ? "slab:deck" : "slab",
        ...rectBox(room.rect, floor.elevation - SLAB_THICKNESS, SLAB_THICKNESS),
      });
    }
    for (const wall of floor.walls) boxes.push(wallBox(floor, wall));
    for (const window of floor.windows) boxes.push(...windowBoxes(floor, window));
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

/** Keys 1-7 show and hide the grounds, ground floor, upper floor, roof, basement, shore and hill. */
export const FLOOR_KEYS = { "1": "grounds", "2": "ground", "3": "upper", "4": "roof", "5": "lower", "6": "shore", "7": "hill" } as const satisfies Record<string, FloorId>;

/** Every floor shown: the starting state. */
export function allFloorsVisible(): FloorVisibility {
  return Object.fromEntries(Object.values(FLOOR_KEYS).map((id) => [id, true])) as FloorVisibility;
}

export function toggleFloor(visibility: FloorVisibility, floor: FloorId): FloorVisibility {
  return { ...visibility, [floor]: !visibility[floor] };
}
