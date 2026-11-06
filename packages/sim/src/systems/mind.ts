import { ALERT_CALM_TICKS, ALLY_RADIUS_CM, CAMERA_REPORT_DELAY_TICKS, COVER_SEEK_CM, COVER_STAND_OFF_CM, FALLBACK_STOP_CM, RADIO_DELAY_TICKS, RETARGET_CM, SEARCH_TICKS, SIGHT_CHECK_EVERY } from "../defaults";
import { fromCm, toCm } from "../quantize";
import { angleBetween } from "../trig";
import { sortedDoorIds, sortedIds } from "../world";
import type { Entity, EntityPos, Mind, World } from "../world";
import type { Ctx } from "./context";
import { startMove } from "./commands";
import { isqrt } from "./movement";
import { coverAt } from "./combat";
import { reachCm } from "./observe";

/**
 * Defender behavior, driven only by what each defender itself sensed this tick (a `contact` or `noise` event naming it
 * as the observer) and by radio reports from other defenders. Runs at the end of the perception slot so it reacts to
 * this tick's senses; the orders it gives are carried out by movement on the next tick.
 *
 *   routine     at its post, unaware (no entry in `world.minds`).
 *   suspicious  heard something: walks to the spot, searches for SEARCH_TICKS, then goes back.
 *   alerted     saw an operator: stops and watches the spot (faces it), and radios the others, who become alerted after
 *               RADIO_DELAY_TICKS. With no new sighting or report for ALERT_CALM_TICKS it goes to look at the last spot.
 *   returning   walking back to its post; gone from `world.minds` on arrival.
 *
 * An alerted defender engages from where it stands. Once it is under fire (suppressed) it reacts, once per alert: if it
 * sees more operators than it has allies near and the principal is alive it falls back toward the principal; otherwise
 * it moves to the best cover near it on the threat's side (heavy before light, then the nearest, skipping spots another
 * defender has taken), or stays put when it is already covered or there is none. It does not stop to shoot while it
 * runs (see combat). Alert level changes are still not made.
 */
export function mindSystem(world: World, ctx: Ctx, cameraReports: readonly EntityPos[] = []): void {
  const ids = sortedIds(world);
  // Forget minds of defenders that are gone or down.
  for (const id of Object.keys(world.minds).sort()) {
    const e = world.entities[id];
    if (!e || e.side !== "defender" || e.state === "down") delete world.minds[id];
  }
  const living = ids.filter((id) => {
    const e = world.entities[id] as Entity;
    return e.side === "defender" && e.state !== "down";
  });
  const isLiving = new Set(living);
  pruneNoticed(world, ctx, isLiving);
  if (living.length === 0) return;

  // What each defender sensed this tick (the last event wins; events are in a fixed order).
  const saw = new Map<string, EntityPos>();
  const heard = new Map<string, EntityPos>();
  for (const ev of ctx.events) {
    if (ev.type === "contact" && isLiving.has(ev.observer)) {
      const t = world.entities[ev.target];
      if (t && t.state !== "down") saw.set(ev.observer, { ...t.pos }); // a body is evidence (see noticeEvidence), not a live threat
    } else if (ev.type === "noise" && isLiving.has(ev.observer)) {
      heard.set(ev.observer, { floor: ev.at.floor, xCm: toCm(ev.at.x), yCm: toCm(ev.at.y) });
    }
  }

  noticeEvidence(world, ctx, isLiving, saw, heard);

  // A sighting is radioed to every other living defender. A report already on its way keeps its time but takes the newer spot.
  for (const id of living) {
    const spot = saw.get(id);
    if (!spot) continue;
    for (const other of living) {
      if (other === id) continue;
      const m = mindOf(world, other);
      if (m.relay) {
        m.relay.spot = { ...spot };
        // A defender's radio call outranks a camera report already on its way: it alerts, no later than that report.
        if (m.relay.camera) {
          delete m.relay.camera;
          m.relay.due = Math.min(m.relay.due, ctx.tick + RADIO_DELAY_TICKS);
        }
      } else m.relay = { due: ctx.tick + RADIO_DELAY_TICKS, spot: { ...spot } };
    }
  }

  // A camera sighting reaches every living defender after a delay. A report already on its way keeps its time but takes the newer spot.
  for (const spot of cameraReports) {
    for (const other of living) {
      const m = mindOf(world, other);
      if (m.relay) m.relay.spot = { ...spot };
      else m.relay = { due: ctx.tick + CAMERA_REPORT_DELAY_TICKS, spot: { ...spot }, camera: true };
    }
  }

  for (const id of living) {
    const e = world.entities[id] as Entity;
    const seen = saw.get(id);
    let noise = heard.get(id);
    let m = world.minds[id];
    if (!seen && m?.relay?.camera && ctx.tick >= m.relay.due) {
      // The security office's report arrives: an unaware defender goes to look; an alerted one ignores it.
      const spot = { ...m.relay.spot };
      delete m.relay;
      if (m.mode !== "alerted") noise ??= spot; // an alerted defender has its own eyes on the matter and ignores the report
    }

    if (seen) {
      m = mindOf(world, id);
      alert(m, e, seen, ctx.tick);
    } else if (m?.relay && ctx.tick >= m.relay.due) {
      const spot = m.relay.spot;
      delete m.relay;
      if (m.mode !== "alerted") alert(m, e, spot, ctx.tick);
      else {
        // Already alerted: the report refreshes what it is watching and keeps it from calming down.
        m.spot = { ...spot };
        m.t = ctx.tick;
      }
    } else if (noise && m?.mode !== "alerted") {
      m = mindOf(world, id);
      const walkingThere = m.mode === "suspicious" && e.motion !== undefined && dist2(m.spot, noise) < RETARGET_CM * RETARGET_CM;
      if (!walkingThere) {
        m.mode = "suspicious";
        m.spot = noise;
        m.t = ctx.tick;
        delete m.waitFrom;
        turnToward(e, noise);
        goTo(e, noise, ctx);
      }
    } else if (m) {
      if (m.mode === "alerted") {
        if (ctx.tick - m.t >= ALERT_CALM_TICKS) {
          m.mode = "suspicious";
          delete m.waitFrom;
          delete m.cover;
          delete m.fallback;
          goTo(e, m.spot, ctx);
        }
      } else if (m.mode === "suspicious") {
        if (!e.motion) {
          if (m.waitFrom === undefined) m.waitFrom = ctx.tick;
          else if (ctx.tick - m.waitFrom >= SEARCH_TICKS) {
            m.mode = "returning";
            delete m.waitFrom;
            goTo(e, m.post, ctx);
          }
        }
      } else if (m.mode === "returning" && !e.motion) {
        delete world.minds[id];
        continue;
      }
    }
    const alertedNow = world.minds[id];
    if (alertedNow?.mode === "alerted" && alertedNow.cover === undefined && !alertedNow.fallback && (world.suppression[id] ?? 0) > 0) {
      underFire(world, ctx, e, alertedNow, living);
    }
    // An unaware defender with nothing on its way needs no entry.
    const now = world.minds[id];
    if (now && now.mode === "routine" && !now.relay) delete world.minds[id];
  }
}

/** An alerted defender is being shot at: fall back if outnumbered, otherwise take cover. */
function underFire(world: World, ctx: Ctx, e: Entity, m: Mind, living: readonly string[]): void {
  const seen = Object.keys(world.sight).filter((k) => {
    if (!k.startsWith(`${e.id}>`)) return false;
    const t = world.entities[k.slice(e.id.length + 1)];
    return t !== undefined && t.side === "operator" && t.state !== "down";
  }).length;
  const near2 = ALLY_RADIUS_CM * ALLY_RADIUS_CM;
  const allies = living.filter((id) => {
    const a = world.entities[id] as Entity;
    return world.minds[id]?.mode === "alerted" && a.pos.floor === e.pos.floor && dist2(a.pos, e.pos) <= near2;
  }).length;
  const principal = world.entities["principal"];
  if (seen > allies && principal && principal.side === "principal" && principal.state !== "down") {
    m.fallback = true;
    const dx = principal.pos.xCm - e.pos.xCm, dy = principal.pos.yCm - e.pos.yCm;
    const len = isqrt(dx * dx + dy * dy);
    // Stops a couple of metres short of the principal, on the side it comes from.
    const k = len > FALLBACK_STOP_CM ? len - FALLBACK_STOP_CM : 0;
    if (principal.pos.floor !== e.pos.floor) goTo(e, principal.pos, ctx);
    else if (len > 0) goTo(e, { floor: e.pos.floor, xCm: e.pos.xCm + Math.trunc((dx * k) / len), yCm: e.pos.yCm + Math.trunc((dy * k) / len) }, ctx);
    return;
  }
  m.cover = { ...e.pos };
  const spot = m.spot;
  if (spot.floor !== e.pos.floor) return;
  if (coverAt(ctx, e.pos.floor, e.pos.xCm, e.pos.yCm, spot.xCm, spot.yCm) < 1000) return; // already covered
  const taken = living.filter((id) => id !== e.id).flatMap((id) => {
    const c = world.minds[id]?.cover;
    return c ? [c] : [];
  });
  const reach2 = COVER_SEEK_CM * COVER_SEEK_CM;
  let best: { x: number; y: number; heavy: number; d2: number } | undefined;
  for (const c of ctx.sight?.cover() ?? []) {
    if (c.floor !== e.pos.floor) continue;
    const mx = Math.trunc((c.x0 + c.x1) / 2), my = Math.trunc((c.y0 + c.y1) / 2), o = COVER_STAND_OFF_CM;
    for (const [px, py] of [[mx, c.y1 + o], [mx, c.y0 - o], [c.x1 + o, my], [c.x0 - o, my]] as const) {
      const spotPos = { floor: e.pos.floor, xCm: px, yCm: py };
      const d2 = dist2(e.pos, spotPos);
      if (d2 > reach2) continue;
      if (coverAt(ctx, e.pos.floor, px, py, spot.xCm, spot.yCm) >= 1000) continue;
      if (taken.some((t) => t.floor === e.pos.floor && dist2(t, spotPos) < 100 * 100)) continue;
      const heavy = c.kind === "heavy" ? 0 : 1;
      if (!best || heavy < best.heavy || (heavy === best.heavy && d2 < best.d2)) best = { x: px, y: py, heavy, d2 };
    }
  }
  if (!best) return;
  const why = startMove(e, { floor: e.pos.floor, x: fromCm(best.x), y: fromCm(best.y) }, ctx);
  if (why === undefined) m.cover = { floor: e.pos.floor, xCm: best.x, yCm: best.y };
}

function mindOf(world: World, id: string): Mind {
  let m = world.minds[id];
  if (!m) {
    const e = world.entities[id] as Entity;
    m = { mode: "routine", post: { ...e.pos }, spot: { ...e.pos }, t: 0 };
    world.minds[id] = m;
  }
  return m;
}

function alert(m: Mind, e: Entity, spot: EntityPos, tick: number): void {
  const relocating = m.mode === "alerted" && (m.cover !== undefined || m.fallback === true) && e.motion !== undefined;
  if (m.mode !== "alerted") {
    delete m.cover;
    delete m.fallback;
  }
  m.mode = "alerted";
  m.spot = { ...spot };
  m.t = tick;
  delete m.waitFrom;
  delete m.relay;
  if (!relocating) stop(e); // a defender already running for cover keeps running
  turnToward(e, spot);
}

function turnToward(e: Entity, spot: EntityPos): void {
  if (spot.xCm !== e.pos.xCm || spot.yCm !== e.pos.yCm) {
    e.facing = angleBetween({ x: fromCm(e.pos.xCm), y: fromCm(e.pos.yCm) }, { x: fromCm(spot.xCm), y: fromCm(spot.yCm) });
  }
}

function stop(e: Entity): void {
  delete e.motion;
  if (e.state === "moving") e.state = "idle";
}

/** Walks to a spot, or stays put (and drops any old walk) when there is no route there. */
function goTo(e: Entity, spot: EntityPos, ctx: Ctx): void {
  const why = startMove(e, { floor: spot.floor, x: fromCm(spot.xCm), y: fromCm(spot.yCm) }, ctx);
  if (why !== undefined) stop(e);
}

function dist2(a: EntityPos, b: EntityPos): number {
  const dx = a.xCm - b.xCm, dy = a.yCm - b.yCm;
  return dx * dx + dy * dy;
}

/**
 * Evidence: a defender who looks at a door that has been changed from how the map starts (opened, closed or unlocked),
 * or at a downed unit that is not an operator, notices it once. A changed door makes it suspicious (it goes to look);
 * a body alerts it, and that is radioed like a sighting. Defenders look on the same staggered schedule as sight, with
 * the same field of view and line of sight. Noticed evidence is remembered in `world.noticed` until it stops being
 * evidence (the door goes back to its start state), so putting a door back lets it be noticed again.
 */
/** Forgets noticed evidence that is no longer evidence, or whose defender is gone or down. */
function pruneNoticed(world: World, ctx: Ctx, living: ReadonlySet<string>): void {
  const env = ctx.sight;
  if (!env) return;
  for (const key of Object.keys(world.noticed).sort()) {
    const at = key.indexOf(">");
    const who = key.slice(0, at);
    const what = key.slice(at + 1);
    const stillEvidence = what.startsWith("door:")
      ? world.doors[what.slice(5)] !== env.doorStart(what.slice(5))
      : world.entities[what.slice(5)]?.state === "down";
    if (!living.has(who) || !stillEvidence) delete world.noticed[key];
  }
}

function noticeEvidence(world: World, ctx: Ctx, living: ReadonlySet<string>, saw: Map<string, EntityPos>, heard: Map<string, EntityPos>): void {
  const env = ctx.sight;
  if (!env) return;
  const ids = sortedIds(world);
  const doors = sortedDoorIds(world).filter((d) => world.doors[d] !== env.doorStart(d));
  const bodies = ids.filter((id) => {
    const e = world.entities[id] as Entity;
    return e.state === "down" && e.side !== "operator";
  });
  if (doors.length === 0 && bodies.length === 0) return;
  const los = env.los();

  for (const id of ids) {
    if (!living.has(id) || (ctx.tick + ids.indexOf(id)) % SIGHT_CHECK_EVERY !== 0) continue;
    const d = world.entities[id] as Entity;
    const from = { floor: d.pos.floor, x: fromCm(d.pos.xCm), y: fromCm(d.pos.yCm) };
    // `face` looks at a point a little (30 cm) in front of the spot, on this defender's side: a closed door is itself a
    // wall to the line of sight, but its face can be seen.
    const sees = (floor: EntityPos["floor"], xCm: number, yCm: number, face = false): boolean => {
      const dx = xCm - d.pos.xCm, dy = yCm - d.pos.yCm;
      const reach = reachCm(d, xCm, yCm);
      if (dx * dx + dy * dy > reach * reach) return false;
      const len = isqrt(dx * dx + dy * dy);
      const k = face && len > 30 ? 30 : 0;
      const px = k ? xCm - Math.trunc((dx * k) / len) : xCm;
      const py = k ? yCm - Math.trunc((dy * k) / len) : yCm;
      return los.sight(from, { floor, x: fromCm(px), y: fromCm(py) }).visible;
    };
    for (const doorId of doors) {
      const key = `${id}>door:${doorId}`;
      const at = env.doorPos(doorId);
      if (Object.hasOwn(world.noticed, key) || !at || !sees(at.floor, toCm(at.x), toCm(at.y), true)) continue;
      world.noticed[key] = ctx.tick;
      if (!heard.has(id)) heard.set(id, { floor: at.floor, xCm: toCm(at.x), yCm: toCm(at.y) });
    }
    for (const bodyId of bodies) {
      const key = `${id}>body:${bodyId}`;
      const b = world.entities[bodyId] as Entity;
      if (Object.hasOwn(world.noticed, key) || !sees(b.pos.floor, b.pos.xCm, b.pos.yCm)) continue;
      world.noticed[key] = ctx.tick;
      if (!saw.has(id)) saw.set(id, { ...b.pos });
    }
  }
}
