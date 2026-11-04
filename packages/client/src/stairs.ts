import type { FloorId, MapFile } from "@war-room/content";

type Link = MapFile["verticalLinks"][number];

/** How far off the flight's centre line (in metres) a unit can be and still count as walking on it. */
const LANE = 0.3;

/**
 * Extra height, in metres, for a unit standing on a stair flight. The sim walks a flight as a horizontal line on one
 * floor and changes floor on arrival; the renderer uses this to draw the climb instead of a walk through the wall.
 *
 * On the lower floor the lift rises from 0 at the foot to the full rise at the top. On the upper floor (walking down)
 * it is 0 at the top and falls to minus the full rise at the foot. Only axis-aligned flights with a horizontal run.
 */
export function stairLift(links: readonly Link[], elevations: Readonly<Record<FloorId, number>>, floor: FloorId, x: number, y: number): number {
  for (const link of links) {
    if (link.kind !== "stairs") continue;
    const [lo, hi] = elevations[link.from.floor] <= elevations[link.to.floor] ? [link.from, link.to] : [link.to, link.from];
    if (floor !== lo.floor && floor !== hi.floor) continue;
    const rise = elevations[hi.floor] - elevations[lo.floor];
    const dx = hi.at.x - lo.at.x;
    const dy = hi.at.y - lo.at.y;
    if (rise <= 0 || (dx !== 0 && dy !== 0) || Math.abs(dx) + Math.abs(dy) < 2) continue;
    const alongX = dx !== 0;
    const run = alongX ? dx : dy;
    const t = ((alongX ? x - lo.at.x : y - lo.at.y)) / run;
    const side = Math.abs(alongX ? y - lo.at.y : x - lo.at.x);
    if (side > LANE || t < 0 || t > 1) continue;
    return floor === lo.floor ? rise * t : -rise * (1 - t);
  }
  return 0;
}
