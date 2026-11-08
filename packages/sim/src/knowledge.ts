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
  /** Known to be down: one of ours that is down, or a unit this side saw go down or saw lying down. */
  down: boolean;
}

/** A shot this side saw being fired (it had the shooter in view, or the shooter is its own). */
export interface KnownShot {
  shooter: string;
  /** Where it was aimed: the target's position. */
  floor: FloorId;
  x: number;
  y: number;
  /** Whether the shot struck its target (seen by this side, like the shot itself). */
  hit: boolean;
  tick: number;
}

/** Something this side heard: roughly where, what kind, and when. The source is not known. */
export interface KnownNoise {
  floor: FloorId;
  x: number;
  y: number;
  kind: "steps" | "door" | "shot";
  tick: number;
}

/** A security camera on a side's feed list (only once the side has tapped the camera network). */
export interface KnownCamera {
  /** The camera's device id (its marker id). */
  id: string;
  floor: FloorId;
  x: number;
  y: number;
  /** Carrying a feed right now: the device is on and a hub is online. Off, looped or hubless cameras show as dark. */
  live: boolean;
  /** Ids of the units it has had in view within the last LIVE_TICKS, sorted. Empty while it is not live. */
  sees: string[];
}

/** A side remembers this many sounds, newest last. */
export const NOISE_MEMORY = 32;

export interface Knowledge {
  /** Tap the camera network (the cyber hack). From then on, camera sightings count as contacts and `cameras()` lists the feeds. Cannot be undone. */
  tapCameras(): void;
  cameraTapped(): boolean;
  /** Every camera on the map with what it sees, sorted by id; empty until the network is tapped. */
  cameras(): KnownCamera[];
  /** Feed one tick's snapshot and events, in tick order. */
  update(snapshot: Snapshot, events: readonly SimEvent[]): void;
  /** Every unit this side knows about, sorted by id. Anyone never seen is absent. */
  units(): KnownUnit[];
  /** Sounds heard by this side's units, oldest first (at most NOISE_MEMORY). */
  noises(): KnownNoise[];
  /** Shots this side saw fired, oldest first (at most NOISE_MEMORY). Gunfire it only heard is in `noises()`. */
  shots(): KnownShot[];
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
  down: boolean;
}

export function createKnowledge(map: MapFile, side: Side): Knowledge {
  const allDoors = new Map<string, boolean>(); // id -> hidden
  for (const floor of map.floors) for (const d of floor.doors) allDoors.set(d.id, d.hidden === true);
  const revealed = new Set<string>();
  const seen = new Map<string, Seen>();
  const noises: KnownNoise[] = [];
  const shots: KnownShot[] = [];
  // Static camera data: the markers tagged smart:camera (a camera's device id is its marker id).
  const cameraMarks = map.markers
    .filter((m) => m.at !== undefined && m.tags.includes("smart:camera"))
    .map((m) => ({ id: m.id, floor: m.floor, x: (m.at as { x: number }).x, y: (m.at as { y: number }).y }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cameraSeen = new Map<string, Map<string, number>>(); // device -> target -> tick last in view
  let tapped = false;
  let devices: Snapshot["devices"] = [];
  let hubOnline = false;
  let now = 0;

  return {
    tapCameras() {
      tapped = true;
    },

    cameraTapped() {
      return tapped;
    },

    cameras() {
      if (!tapped) return [];
      return cameraMarks.map((c) => {
        const live = hubOnline && devices.some((d) => d.id === c.id && d.kind === "camera" && d.state === "on");
        const sees = live ? [...(cameraSeen.get(c.id) ?? new Map<string, number>())].filter(([, tick]) => now - tick <= LIVE_TICKS).map(([id]) => id).sort() : [];
        return { id: c.id, floor: c.floor, x: c.x, y: c.y, live, sees };
      });
    },

    update(snapshot, events) {
      now = snapshot.tick;
      devices = snapshot.devices;
      hubOnline = snapshot.hubOnline;
      const byId = new Map(snapshot.entities.map((e) => [e.id, e]));
      const sideOf = (id: string): Side | undefined => byId.get(id)?.side ?? seen.get(id)?.side;
      for (const e of snapshot.entities) {
        if (e.side === side) seen.set(e.id, { side: e.side, floor: e.pos.floor, x: e.pos.x, y: e.pos.y, tick: snapshot.tick, down: e.state === "down" });
      }
      for (const ev of events) {
        if (ev.type === "noise") {
          if (sideOf(ev.observer) !== side) continue;
          noises.push({ floor: ev.at.floor, x: ev.at.x, y: ev.at.y, kind: ev.kind, tick: ev.tick });
          if (noises.length > NOISE_MEMORY) noises.shift();
          continue;
        }
 
        if (ev.type === "camera") {
          // Nothing is learned until the network is tapped; a unit on the side itself is already known.
          const target = byId.get(ev.target);
          if (!tapped || !target || target.side === side) continue;
          let per = cameraSeen.get(ev.device);
          if (!per) cameraSeen.set(ev.device, (per = new Map()));
          per.set(target.id, ev.tick);
          seen.set(target.id, { side: target.side, floor: target.pos.floor, x: target.pos.x, y: target.pos.y, tick: ev.tick, down: target.state === "down" });
          continue;
        }
        if (ev.type === "down") {
          const s = seen.get(ev.entity);
          if (s && (s.side === side || now - s.tick <= LIVE_TICKS)) s.down = true;
          continue;
        }
        if (ev.type === "shot") {
          const s = seen.get(ev.shooter);
          if (s && (s.side === side || ev.tick - s.tick <= LIVE_TICKS)) {
            shots.push({ shooter: ev.shooter, floor: ev.at.floor, x: ev.at.x, y: ev.at.y, hit: ev.hit, tick: ev.tick });
            if (shots.length > NOISE_MEMORY) shots.shift();
          }
          continue;
        }
        if (ev.type !== "contact" || sideOf(ev.observer) !== side) continue;
        const target = byId.get(ev.target);
        if (!target || target.side === side) continue;
        seen.set(target.id, { side: target.side, floor: target.pos.floor, x: target.pos.x, y: target.pos.y, tick: ev.tick, down: target.state === "down" });
      }
    },

    units() {
      return [...seen.keys()].sort().map((id) => this.unit(id) as KnownUnit);
    },

    noises() {
      return noises.map((n) => ({ ...n }));
    },

    shots() {
      return shots.map((s) => ({ ...s }));
    },

    unit(id) {
      const s = seen.get(id);
      if (!s) return undefined;
      const own = s.side === side;
      return { id, side: s.side, floor: s.floor, x: s.x, y: s.y, lastSeenTick: s.tick, live: own || now - s.tick <= LIVE_TICKS, own, down: s.down };
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
