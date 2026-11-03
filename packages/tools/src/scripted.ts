import { createRng, createSim } from "@war-room/sim";
import type { MapFile } from "@war-room/content";
import { createRecorder } from "./replay";
import type { Recording } from "./replay";

export interface ScriptedRun {
  recording: Recording;
  /** State hash after each tick. */
  hashes: string[];
  /** Event counts by type, keys in sorted order. */
  eventCounts: Record<string, number>;
  finalHash: string;
}

/** Every this-many ticks each unit may get a new random destination. */
const ORDER_INTERVAL = 20;

function spawnsOf(map: MapFile): { id: string; floor: "grounds" | "ground" | "upper" | "roof" }[] {
  const out: { id: string; floor: "grounds" | "ground" | "upper" | "roof" }[] = [];
  for (const m of map.markers) {
    if (m.kind !== "spawn") continue;
    const id = m.tags.find((t) => t.startsWith("entity:"))?.slice("entity:".length);
    if (id) out.push({ id, floor: m.floor });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Runs one raid with scripted random moves. The script draws from its own
 * PRNG derived from the seed (the sim's internal RNG is not exposed), so the
 * whole run is reproducible from `seed` alone.
 */
export function runScripted(opts: { map: MapFile; seed: number; ticks: number }): ScriptedRun {
  const { map, seed, ticks } = opts;
  if (!Number.isInteger(seed)) throw new Error(`seed must be an integer, got ${seed}`);
  if (!Number.isInteger(ticks) || ticks < 0) throw new Error(`ticks must be a non-negative integer, got ${ticks}`);

  const sim = createSim({ seed, map });
  const rec = createRecorder(sim, { seed, map });
  const units = spawnsOf(map);

  const hashes: string[] = [];
  const counts = new Map<string, number>();
  const driver = createRng((seed ^ 0x5eed5eed) | 0);
  const minX = Math.round(map.bounds.min.x * 100);
  const maxX = Math.round(map.bounds.max.x * 100);
  const minY = Math.round(map.bounds.min.y * 100);
  const maxY = Math.round(map.bounds.max.y * 100);

  for (let t = 0; t < ticks; t++) {
    if (t % ORDER_INTERVAL === 0) {
      for (const unit of units) {
        if (driver.int(0, 1) === 0) continue;
        const x = driver.int(minX, maxX) / 100;
        const y = driver.int(minY, maxY) / 100;
        rec.enqueue({ kind: "move", tick: t, entity: unit.id, to: { floor: unit.floor, x, y } });
      }
    }
    const { events } = rec.step();
    for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    hashes.push(sim.hash());
  }

  const eventCounts: Record<string, number> = {};
  for (const type of [...counts.keys()].sort()) eventCounts[type] = counts.get(type) as number;

  return { recording: rec.finish(), hashes, eventCounts, finalHash: hashes[hashes.length - 1] ?? sim.hash() };
}
