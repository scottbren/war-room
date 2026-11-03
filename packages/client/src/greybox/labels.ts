import type { FloorId, MapFile } from "@war-room/content";

export interface RoomLabel {
  id: string;
  text: string;
  floor: FloorId;
  /** Babylon axes: x east, y up, z north. */
  position: [number, number, number];
  /** Floors above this room that have a (non-void) room over its center: while one is shown, hide this label. */
  hiddenBy: FloorId[];
}

/** Rooms smaller than this (square meters) get no label; it would not fit. */
const MIN_AREA = 12;

/** One label per room, at its center just above the floor. Open voids and tiny rooms are skipped. */
export function planLabels(map: MapFile): RoomLabel[] {
  const labels: RoomLabel[] = [];
  const coveredBy = (floor: MapFile["floors"][number], x: number, y: number): FloorId[] =>
    map.floors
      .filter((o) => o.elevation > floor.elevation && o.rooms.some((r) => !r.tags.includes("void") && x >= r.rect.min.x && x <= r.rect.max.x && y >= r.rect.min.y && y <= r.rect.max.y))
      .map((o) => o.id)
      .sort();
  for (const floor of map.floors) {
    for (const room of floor.rooms) {
      const w = room.rect.max.x - room.rect.min.x;
      const d = room.rect.max.y - room.rect.min.y;
      if (room.tags.includes("void") || w * d < MIN_AREA) continue;
      labels.push({
        id: room.id,
        text: room.name,
        floor: floor.id,
        position: [(room.rect.min.x + room.rect.max.x) / 2, floor.elevation + 0.3, (room.rect.min.y + room.rect.max.y) / 2],
        hiddenBy: coveredBy(floor, (room.rect.min.x + room.rect.max.x) / 2, (room.rect.min.y + room.rect.max.y) / 2),
      });
    }
  }
  return labels.sort((a, b) => (a.floor + "/" + a.id < b.floor + "/" + b.id ? -1 : 1));
}
