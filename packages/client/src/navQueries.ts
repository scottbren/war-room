import type { FloorId, MapFile } from "@war-room/content";
import type { Nav, Pos } from "@war-room/sim";

/** The four T8 path queries, run the same way in Node tests and inside the debug worker. */
export type NavQueryResult = { name: string; points: number; startFloor: string; endFloor: string; floors: string[]; lengthM: number };

function walkableCentre(nav: Nav, map: MapFile, floor: FloorId, roomId: string): Pos {
  const r = map.floors.find((f) => f.id === floor)!.rooms.find((x) => x.id === roomId)!.rect;
  const cx = (r.min.x + r.max.x) / 2, cy = (r.min.y + r.max.y) / 2;
  const pts: { x: number; y: number; d: number }[] = [];
  for (let x = r.min.x + 0.5; x <= r.max.x - 0.5; x += 0.5) for (let y = r.min.y + 0.5; y <= r.max.y - 0.5; y += 0.5) pts.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  pts.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
  const hit = pts.map((p) => ({ floor, x: p.x, y: p.y })).find((p) => nav.isWalkable(p));
  if (!hit) throw new Error(`no walkable point in ${roomId}`);
  return hit;
}

export function runNavQueries(nav: Nav, map: MapFile): NavQueryResult[] {
  const at = (floor: FloorId, id: string) => walkableCentre(nav, map, floor, id);
  const queries: [string, Pos, Pos][] = [
    ["foyer to study", at("ground", "g.foyer"), at("ground", "g.study")],
    ["foyer to son room via the stairs", at("ground", "g.foyer"), at("upper", "u.son")],
    ["master suite to panic room", at("ground", "g.master"), at("ground", "g.panic")],
    ["panic room to boathouse via the tunnel", at("ground", "g.panic"), at("shore", "grounds.boathouse")],
    ["helipad to study", { floor: "grounds", x: 48, y: 68 }, at("ground", "g.study")],
  ];
  return queries.map(([name, from, to]) => {
    const path = nav.findPath(from, to);
    let lengthM = 0;
    for (let i = 1; i < path.length; i++) lengthM += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
    return {
      name,
      points: path.length,
      startFloor: path[0]?.floor ?? "none",
      endFloor: path.at(-1)?.floor ?? "none",
      floors: [...new Set(path.map((p) => p.floor))],
      lengthM: Math.round(lengthM * 100) / 100,
    };
  });
}
