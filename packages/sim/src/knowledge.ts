import type { FloorId, MapFile, Side } from "@war-room/content";
import type { Snapshot, SimEvent } from "./types";

/**
 * One side's picture of the raid, built only from what that side has been told: its own units, `contact` events
 * (someone on the side saw someone), and the plans it holds. It is the only thing the UI and the advisors' prompts
 * should read; the snapshot is truth and is used here only to look up a contacted unit's position at the moment of contact.
 *
 * It is derived data, not simulation state: feed it the snapshot and events of every tick in order. Plain data in,
 * plain data out, no clock and no randomness.
 */

/** A unit counts as in view while its last contact is no older than this many ticks (a contact repeats every 3 while seen). */
export const LIVE_TICKS = 6;

export interface KnownUnit {
  id: string;
  side: Side;
  /** Where the unit was when this side last knew: now for own units, at the last contact for anyone else. */
  floor: FloorId;
  x: number;
  y: number;
  /** Tick of the last contact (or the latest snapshot, for own units). */
  lastSeenTick: number;
  /** In view right now (or one of ours). A unit that is not live is a last-known position: it may have moved. */
  live: boolean;
  own: boolean;
}

/** Something this side heard: roughly where, what kind, and when. The source is not known. */
export interface KnownNoise {
  floor: FloorId;
  x: number;
  y: number;
  kind: "steps" | "door";
  tick: number;
}

/** A side remembers this many sounds, newest last. */
export const NOISE_MEMORY = 32;

export interface Knowledge {
  /** Feed one tick's snapshot and events, in tick order. */
  update(snapshot: Snapshot, events: readonly SimEvent[]): void;
  /** Every unit this side knows about, sorted by id. Anyone never seen is absent. */
  units(): KnownUnit[];
  /** Sounds heard by this side's units, oldest first (at most NOISE_MEMORY). */
  noises(): KnownNoise[];
  /** The unit, if known. */
  unit(id: string): KnownUnit | undefined;
  /** Doors on this side's plans: every door except hidden ones nobody has found yet. Sorted. */
  knownDoorIds(): string[];
  isDoorKnown(doorId: string): boolean;
  /** A hidden door has been found (a search, a report, a resident's tip). Unknown ids are an error. */
  revealDoor(doorId: string): void;
  /** Ids of hidden doors this side has found. Sorted. */
  revealedDoorIds(): string[];
}

interface Seen {
  side: Side;
  floor: FloorId;
  x: number;
  y: number;
  tick: number;
}

export function createKnowledge(map: MapFile, side: Side): Knowledge {
  const allDoors = new Map<string, boolean>(); // id -> hidden
  for (const floor of map.floors) for (const d of floor.doors) allDoors.set(d.id, d.hidden === true);
  const revealed = new Set<string>();
  const seen = new Map<string, Seen>();
  const noises: KnownNoise[] = [];
  let now = 0;

  return {
    update(snapshot, events) {
      now = snapshot.tick;
      const byId = new Map(snapshot.entities.map((e) => [e.id, e]));
      const sideOf = (id: string): Side | undefined => byId.get(id)?.side ?? seen.get(id)?.side;
      for (const e of snapshot.entities) {
        if (e.side === side) seen.set(e.id, { side: e.side, floor: e.pos.floor, x: e.pos.x, y: e.pos.y, tick: snapshot.tick });
      }
      for (const ev of events) {
        if (ev.type === "noise") {
          if (sideOf(ev.observer) !== side) continue;
          noises.push({ floor: ev.at.floor, x: ev.at.x, y: ev.at.y, kind: ev.kind, tick: ev.tick });
          if (noises.length > NOISE_MEMORY) noises.shift();
          continue;
        }
        if (ev.type !== "contact" || sideOf(ev.observer) !== side) continue;
        const target = byId.get(ev.target);
        if (!target || target.side === side) continue;
        seen.set(target.id, { side: target.side, floor: target.pos.floor, x: target.pos.x, y: target.pos.y, tick: ev.tick });
      }
    },

    units() {
      return [...seen.keys()].sort().map((id) => this.unit(id) as KnownUnit);
    },

    noises() {
      return noises.map((n) => ({ ...n }));
    },

    unit(id) {
      const s = seen.get(id);
      if (!s) return undefined;
      const own = s.side === side;
      return { id, side: s.side, floor: s.floor, x: s.x, y: s.y, lastSeenTick: s.tick, live: own || now - s.tick <= LIVE_TICKS, own };
    },

    knownDoorIds() {
      return [...allDoors.keys()].filter((id) => this.isDoorKnown(id)).sort();
    },

    isDoorKnown(doorId) {
      const hidden = allDoors.get(doorId);
      return hidden !== undefined && (!hidden || revealed.has(doorId));
    },

    revealDoor(doorId) {
      if (!allDoors.has(doorId)) throw new Error(`knowledge: unknown door ${doorId}`);
      revealed.add(doorId);
    },

    revealedDoorIds() {
      return [...revealed].sort();
    },
  };
}
