import type { Floor, FloorId, MapFile } from "@war-room/content";
import { toCm } from "./quantize";
import type { Pos } from "./types";

/**
 * Line of sight on grids of 0.5 m cells, one per floor height.
 * Cell value: 0 open, 1 low cover (hides a crouched target, not a standing one), 2 full block (walls, closed
 * doors and shutters, tall cover). Concealment (hedges, trees) is a separate flag that never blocks sight but
 * cuts detection range. Rays are traced with an integer Amanatides-Woo DDA on centimetre coordinates: the
 * loop uses only integer adds and compares.
 */
export type Stance = "standing" | "crouched";
export type Sight = { visible: boolean; concealed: boolean };
export type LosDoorState = "open" | "closed" | "locked" | "breached";
export type CellValue = 0 | 1 | 2;

export interface Los {
  /** Can `from` see `to`? Stance is the target stance. Works across a gallery void between floors. */
  sight(from: Pos, to: Pos, targetStance?: Stance): Sight;
  setDoor(doorId: string, state: LosDoorState): void;
  setShutter(windowId: string, state: "open" | "closed"): void;
  cellValue(floor: FloorId, x: number, y: number): CellValue;
}

const CELL = 50; // cm
const LOW_COVER_MIN = 41; // cm: anything 40 cm or lower is stepped over
const FULL_COVER_MIN = 160; // cm
const MIN_OVERLAP = 20; // cm a cover rect must cover of a cell to mark it
const CONCEAL = 4;
const NO_SIGHT: Sight = { visible: false, concealed: false };

const floorDiv = (a: number, b: number): number => Math.floor(a / b);
const ceilDiv = (a: number, b: number): number => Math.ceil(a / b);

type Grid = { base: Uint8Array; dyn: Uint8Array };
type Span = { cols: [number, number]; rows: [number, number] };

export function effectiveRange(rangeCm: number, concealed: boolean): number {
  return concealed ? Math.floor(rangeCm / 2) : rangeCm;
}

export function createLos(map: MapFile): Los {
  const ox = toCm(map.bounds.min.x), oy = toCm(map.bounds.min.y);
  const W = ceilDiv(toCm(map.bounds.max.x) - ox, CELL), H = ceilDiv(toCm(map.bounds.max.y) - oy, CELL);
  const grids = new Map<FloorId, Grid>();
  const doorCells = new Map<string, { floor: FloorId; span: Span }>();
  const windowCells = new Map<string, { floor: FloorId; span: Span }>();
  const openings: { floor: FloorId; below: FloorId; min: { x: number; y: number }; max: { x: number; y: number } }[] = [];

  const colOf = (cm: number): number => floorDiv(cm - ox, CELL);
  const rowOf = (cm: number): number => floorDiv(cm - oy, CELL);
  const inGrid = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < W && r < H;

  const fillBase = (grid: Grid, span: Span, value: number): void => {
    for (let r = span.rows[0]; r <= span.rows[1]; r++) {
      for (let c = span.cols[0]; c <= span.cols[1]; c++) {
        if (!inGrid(c, r)) continue;
        const i = r * W + c;
        const block = Math.max(grid.base[i]! & 3, value & 3);
        grid.base[i] = block | (grid.base[i]! & CONCEAL) | (value & CONCEAL);
      }
    }
  };

  const applyDyn = (grid: Grid, span: Span, value: number): void => {
    for (let r = span.rows[0]; r <= span.rows[1]; r++) {
      for (let c = span.cols[0]; c <= span.cols[1]; c++) if (inGrid(c, r)) grid.dyn[r * W + c] = value;
    }
  };

  /** A wall or gap along one axis: the cells its centre line passes through, half-open at the far end. */
  const lineSpan = (ax: number, ay: number, bx: number, by: number): Span => {
    const x0 = Math.min(toCm(ax), toCm(bx)), x1 = Math.max(toCm(ax), toCm(bx));
    const y0 = Math.min(toCm(ay), toCm(by)), y1 = Math.max(toCm(ay), toCm(by));
    if (y0 === y1) return { cols: [colOf(x0), ceilDiv(x1 - ox, CELL) - 1], rows: [rowOf(y0), rowOf(y0)] };
    if (x0 === x1) return { cols: [colOf(x0), colOf(x0)], rows: [rowOf(y0), ceilDiv(y1 - oy, CELL) - 1] };
    throw new Error("los: diagonal walls are not supported"); // map walls are axis aligned
  };

  /** A door or window sits in a gap in a wall; the wall ends beside it say which way the gap runs. */
  const gapSpan = (floor: Floor, at: { x: number; y: number }, width: number): Span => {
    const half = width / 2;
    const near = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) < 0.06 && Math.abs(p.y - y) < 0.06;
    const ends = floor.walls.flatMap((w) => [w.a, w.b]);
    const horizontal = ends.some((p) => near(p, at.x - half, at.y) || near(p, at.x + half, at.y));
    return horizontal ? lineSpan(at.x - half, at.y, at.x + half, at.y) : lineSpan(at.x, at.y - half, at.x, at.y + half);
  };

  /**
   * A window sits inside a solid wall (derived walls are not cut for windows), so unlike a door the wall ends do not
   * mark it. Find the wall that carries it and run the span along that wall.
   */
  const windowSpan = (floor: Floor, at: { x: number; y: number }, width: number): Span => {
    const half = width / 2;
    for (const w of floor.walls) {
      const horizontal = Math.abs(w.a.y - w.b.y) < 0.06 && Math.abs(at.y - w.a.y) < 0.06 && at.x >= Math.min(w.a.x, w.b.x) - 0.06 && at.x <= Math.max(w.a.x, w.b.x) + 0.06;
      if (horizontal) return lineSpan(at.x - half, at.y, at.x + half, at.y);
      const vertical = Math.abs(w.a.x - w.b.x) < 0.06 && Math.abs(at.x - w.a.x) < 0.06 && at.y >= Math.min(w.a.y, w.b.y) - 0.06 && at.y <= Math.max(w.a.y, w.b.y) + 0.06;
      if (vertical) return lineSpan(at.x, at.y - half, at.x, at.y + half);
    }
    return gapSpan(floor, at, width);
  };

  // Floors at the same height are one space (the outdoor grounds and the house's ground floor; the hill and the
  // upper floor), so they share a grid: someone in the yard can see in through a window.
  const byElevation = new Map<number, Grid>();
  for (const floor of map.floors) {
    let grid = byElevation.get(floor.elevation);
    if (!grid) {
      grid = { base: new Uint8Array(W * H), dyn: new Uint8Array(W * H) };
      byElevation.set(floor.elevation, grid);
    }
    grids.set(floor.id, grid);
    for (const w of floor.walls) fillBase(grid, lineSpan(w.a.x, w.a.y, w.b.x, w.b.y), 2);
    for (const c of floor.cover) {
      const heightCm = toCm(c.height);
      const value = c.type === "concealment" ? CONCEAL : heightCm >= FULL_COVER_MIN ? 2 : heightCm >= LOW_COVER_MIN ? 1 : 0;
      if (value === 0) continue;
      const r = { x0: toCm(c.rect.min.x), y0: toCm(c.rect.min.y), x1: toCm(c.rect.max.x), y1: toCm(c.rect.max.y) };
      const needX = Math.min(MIN_OVERLAP, r.x1 - r.x0), needY = Math.min(MIN_OVERLAP, r.y1 - r.y0);
      for (let row = rowOf(r.y0); row <= rowOf(r.y1); row++) {
        for (let col = colOf(r.x0); col <= colOf(r.x1); col++) {
          const cx0 = ox + col * CELL, cy0 = oy + row * CELL;
          const overlapX = Math.min(r.x1, cx0 + CELL) - Math.max(r.x0, cx0);
          const overlapY = Math.min(r.y1, cy0 + CELL) - Math.max(r.y0, cy0);
          if (overlapX > 0 && overlapY > 0 && overlapX >= needX && overlapY >= needY) fillBase(grid, { cols: [col, col], rows: [row, row] }, value);
        }
      }
    }
    for (const d of floor.doors) {
      const span = gapSpan(floor, d.at, d.width);
      doorCells.set(d.id, { floor: floor.id, span });
      applyDyn(grid, span, d.state === "open" ? 0 : 2);
    }
    for (const w of floor.windows) {
      if (w.shutter) windowCells.set(w.id, { floor: floor.id, span: windowSpan(floor, w.at, w.width) });
    }
    for (const o of floor.openings) openings.push({ floor: floor.id, below: o.below, min: o.rect.min, max: o.rect.max });
  }

  // Glass lets sight through: clear the wall cells behind each window. A closed shutter blocks them again. This runs
  // after every floor's walls and cover are in, because floors at one height share a grid and a later floor must not refill them.
  for (const floor of map.floors) {
    const grid = grids.get(floor.id)!;
    for (const w of floor.windows) {
      const span = windowSpan(floor, w.at, w.width);
      for (let r = span.rows[0]; r <= span.rows[1]; r++) {
        for (let c = span.cols[0]; c <= span.cols[1]; c++) {
          if (inGrid(c, r)) grid.base[r * W + c] = grid.base[r * W + c]! & CONCEAL;
        }
      }
    }
  }

  const cellAt = (grid: Grid, c: number, r: number): number => {
    const i = r * W + c;
    return Math.max(grid.base[i]! & 3, grid.dyn[i]!) | (grid.base[i]! & CONCEAL);
  };

  /** Integer DDA from (x0,y0) to (x1,y1) in cm. Start and end cells are not tested for blocking. */
  const trace = (floor: FloorId, x0: number, y0: number, x1: number, y1: number, stance: Stance): Sight => {
    const grid = grids.get(floor);
    let c = colOf(x0), r = rowOf(y0);
    const ec = colOf(x1), er = rowOf(y1);
    if (!grid || !inGrid(c, r) || !inGrid(ec, er)) return NO_SIGHT;
    let concealed = (cellAt(grid, ec, er) & CONCEAL) !== 0;
    if (c === ec && r === er) return { visible: true, concealed };

    const dx = x1 - x0, dy = y1 - y0;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const BIG = Number.MAX_SAFE_INTEGER;
    // Crossing times scaled so that everything stays an integer: t in [0, total) is the open segment.
    const mx = ay === 0 ? 1 : ay, my = ax === 0 ? 1 : ax;
    const distX = dx > 0 ? ox + (c + 1) * CELL - x0 : x0 - (ox + c * CELL);
    const distY = dy > 0 ? oy + (r + 1) * CELL - y0 : y0 - (oy + r * CELL);
    let tx = ax === 0 ? BIG : distX * mx, ty = ay === 0 ? BIG : distY * my;
    const dtx = CELL * mx, dty = CELL * my;
    const total = ax === 0 ? ay : ay === 0 ? ax : ax * ay;

    const blocks = (cc: number, rr: number): boolean => {
      const v = cellAt(grid, cc, rr);
      if (v & CONCEAL) concealed = true;
      const block = v & 3;
      return block === 2 || (block === 1 && stance === "crouched");
    };
    const limit = Math.abs(ec - c) + Math.abs(er - r) + 2;
    for (let n = 0; n < limit; n++) {
      if (tx < ty) {
        if (tx >= total) break;
        c += sx;
        tx += dtx;
      } else if (ty < tx) {
        if (ty >= total) break;
        r += sy;
        ty += dty;
      } else {
        if (tx >= total) break;
        // The ray passes exactly through a cell corner: both side cells must be open (no squeezing past corners).
        // A ray that starts on the corner (tx is 0) only touches them at its first point, like the reverse ray's last point.
        if (tx !== 0) {
          if (!(c + sx === ec && r === er) && blocks(c + sx, r)) return NO_SIGHT;
          if (!(c === ec && r + sy === er) && blocks(c, r + sy)) return NO_SIGHT;
        }
        c += sx;
        r += sy;
        tx += dtx;
        ty += dty;
      }
      if (!inGrid(c, r)) return NO_SIGHT;
      if (c === ec && r === er) break;
      if (blocks(c, r)) return NO_SIGHT;
    }
    return { visible: true, concealed };
  };

  const cm = (p: Pos): { x: number; y: number } => ({ x: toCm(p.x), y: toCm(p.y) });

  /** `above` looks down through a void onto `below` (which must lie under the opening). */
  const throughVoid = (above: Pos, below: Pos, stance: Stance): Sight => {
    const o = openings.find(
      (op) => op.floor === above.floor && op.below === below.floor && below.x >= op.min.x && below.x <= op.max.x && below.y >= op.min.y && below.y <= op.max.y,
    );
    if (!o) return NO_SIGHT;
    const a = cm(above), b = cm(below);
    const px = Math.min(Math.max(a.x, toCm(o.min.x)), toCm(o.max.x));
    const py = Math.min(Math.max(a.y, toCm(o.min.y)), toCm(o.max.y));
    // Leg 1, on the upper floor: observer to the edge of the void (a balustrade is looked over, not through).
    const up = trace(above.floor, a.x, a.y, px, py, "standing");
    if (!up.visible) return NO_SIGHT;
    return trace(below.floor, px, py, b.x, b.y, stance);
  };

  return {
    sight(from, to, targetStance = "standing") {
      if (grids.get(from.floor) !== undefined && grids.get(from.floor) === grids.get(to.floor)) {
        const a = cm(from), b = cm(to);
        return trace(from.floor, a.x, a.y, b.x, b.y, targetStance);
      }
      const seen = throughVoid(from, to, targetStance);
      return seen.visible ? seen : throughVoid(to, from, targetStance);
    },
    setDoor(doorId, state) {
      const d = doorCells.get(doorId);
      if (!d) throw new Error(`los: unknown door ${doorId}`);
      applyDyn(grids.get(d.floor)!, d.span, state === "closed" || state === "locked" ? 2 : 0);
    },
    setShutter(windowId, state) {
      const w = windowCells.get(windowId);
      if (!w) throw new Error(`los: unknown shuttered window ${windowId}`);
      applyDyn(grids.get(w.floor)!, w.span, state === "closed" ? 2 : 0);
    },
    cellValue(floor, x, y) {
      const grid = grids.get(floor);
      const c = colOf(toCm(x)), r = rowOf(toCm(y));
      if (!grid || !inGrid(c, r)) return 0;
      return (cellAt(grid, c, r) & 3) as CellValue;
    },
  };
}
