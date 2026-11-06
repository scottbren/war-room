import { ALERT_CALM_TICKS, RADIO_DELAY_TICKS, RETARGET_CM, SEARCH_TICKS } from "../defaults";
import { fromCm, toCm } from "../quantize";
import { angleBetween } from "../trig";
import { sortedIds } from "../world";
import type { Entity, EntityPos, Mind, World } from "../world";
import type { Ctx } from "./context";
import { startMove } from "./commands";

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
 * Alerted defenders hold position for now; there is no combat, cover-seeking or alert level change yet.
 */
export function mindSystem(world: World, ctx: Ctx): void {
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
  if (living.length === 0) return;
  const isLiving = new Set(living);

  // What each defender sensed this tick (the last event wins; events are in a fixed order).
  const saw = new Map<string, EntityPos>();
  const heard = new Map<string, EntityPos>();
  for (const ev of ctx.events) {
    if (ev.type === "contact" && isLiving.has(ev.observer)) {
      const t = world.entities[ev.target];
      if (t) saw.set(ev.observer, { ...t.pos });
    } else if (ev.type === "noise" && isLiving.has(ev.observer)) {
      heard.set(ev.observer, { floor: ev.at.floor, xCm: toCm(ev.at.x), yCm: toCm(ev.at.y) });
    }
  }

  // A sighting is radioed to every other living defender. A report already on its way keeps its time but takes the newer spot.
  for (const id of living) {
    const spot = saw.get(id);
    if (!spot) continue;
    for (const other of living) {
      if (other === id) continue;
      const m = mindOf(world, other);
      if (m.relay) m.relay.spot = { ...spot };
      else m.relay = { due: ctx.tick + RADIO_DELAY_TICKS, spot: { ...spot } };
    }
  }

  for (const id of living) {
    const e = world.entities[id] as Entity;
    const seen = saw.get(id);
    const noise = heard.get(id);
    let m = world.minds[id];

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
        goTo(e, noise, ctx);
      }
    } else if (m) {
      if (m.mode === "alerted") {
        if (ctx.tick - m.t >= ALERT_CALM_TICKS) {
          m.mode = "suspicious";
          delete m.waitFrom;
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
    // An unaware defender with nothing on its way needs no entry.
    const now = world.minds[id];
    if (now && now.mode === "routine" && !now.relay) delete world.minds[id];
  }
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
  m.mode = "alerted";
  m.spot = { ...spot };
  m.t = tick;
  delete m.waitFrom;
  delete m.relay;
  stop(e);
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
