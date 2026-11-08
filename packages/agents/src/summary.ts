import type { FloorId, MapFile } from "@war-room/content";
import type { Knowledge } from "@war-room/sim";

/** Ticks per second (the sim runs at 10 Hz). */
const TICKS_PER_SECOND = 10;
/** Most entries listed per category, so the summary stays compact however big the fight gets. */
const MAX_PER_CATEGORY = 8;
/** Sounds and shots older than this are not worth mentioning (seconds). */
const RECENT_SECONDS = 30;

/** "Hall (ground)", or "outdoors (ground)" for a spot outside every room: how places are named to advisors. */
export function describePlace(map: MapFile, floor: FloorId, x: number, y: number): string {
  const f = map.floors.find((fl) => fl.id === floor);
  const room = f?.rooms.find((r) => x >= r.rect.min.x && x < r.rect.max.x && y >= r.rect.min.y && y < r.rect.max.y);
  return room ? `${room.name} (${floor})` : `outdoors (${floor})`;
}

/**
 * A compact text picture of the raid for a prompt, built ONLY from the operators' knowledge (what they have seen, heard
 * and been told) and the map's static room names. It never reads simulation truth, so it can be stale or partial, and an
 * advisor can only ever repeat what the side knows. Deterministic: same knowledge and tick give the same text.
 */
export function summarizeKnowledge(map: MapFile, knowledge: Knowledge, now: number): string {
  const where = (floor: FloorId, x: number, y: number): string => describePlace(map, floor, x, y);
  const ago = (tick: number): string => `${Math.max(0, Math.floor((now - tick) / TICKS_PER_SECOND))} s ago`;
  const cap = <T>(items: readonly T[]): { shown: T[]; more: number } => ({ shown: items.slice(0, MAX_PER_CATEGORY), more: Math.max(0, items.length - MAX_PER_CATEGORY) });
  const lines: string[] = [`Time: ${Math.floor(now / TICKS_PER_SECOND)} s into the raid.`];

  const units = knowledge.units();
  const own = cap(units.filter((u) => u.own));
  lines.push(own.shown.length === 0 ? "Our units: none known." : `Our units: ${own.shown.map((u) => `${u.id} in ${where(u.floor, u.x, u.y)}${u.down ? " (down)" : ""}`).join("; ")}${own.more > 0 ? `; and ${own.more} more` : ""}.`);

  const inView = cap(units.filter((u) => !u.own && u.live));
  if (inView.shown.length > 0) lines.push(`In view now: ${inView.shown.map((u) => `${u.id} in ${where(u.floor, u.x, u.y)}${u.down ? " (down)" : ""}`).join("; ")}${inView.more > 0 ? `; and ${inView.more} more` : ""}.`);

  const lastKnown = cap(units.filter((u) => !u.own && !u.live));
  if (lastKnown.shown.length > 0) lines.push(`Last known (may have moved): ${lastKnown.shown.map((u) => `${u.id} in ${where(u.floor, u.x, u.y)}, ${ago(u.lastSeenTick)}${u.down ? " (down)" : ""}`).join("; ")}${lastKnown.more > 0 ? `; and ${lastKnown.more} more` : ""}.`);

  const shots = cap(knowledge.shots().filter((s) => now - s.tick <= RECENT_SECONDS * TICKS_PER_SECOND).reverse());
  if (shots.shown.length > 0) lines.push(`Gunfire seen: ${shots.shown.map((s) => `${s.shooter} fired at ${where(s.floor, s.x, s.y)}, ${s.hit ? "hit" : "missed"}, ${ago(s.tick)}`).join("; ")}.`);

  const heard = cap(knowledge.noises().filter((n) => now - n.tick <= RECENT_SECONDS * TICKS_PER_SECOND).reverse());
  if (heard.shown.length > 0) lines.push(`Heard: ${heard.shown.map((n) => `${n.kind === "shot" ? "gunfire" : n.kind === "door" ? "a door" : "footsteps"} near ${where(n.floor, n.x, n.y)}, ${ago(n.tick)}`).join("; ")}.`);

  if (knowledge.cameraTapped()) {
    const cams = knowledge.cameras();
    const live = cams.filter((c) => c.live);
    const watching = live.filter((c) => c.sees.length > 0);
    lines.push(`Security cameras: tapped, ${live.length} of ${cams.length} live${watching.length > 0 ? `; ${watching.slice(0, MAX_PER_CATEGORY).map((c) => `${c.id} shows ${c.sees.join(", ")}`).join("; ")}` : "; none shows anyone"}.`);
  } else {
    lines.push("Security cameras: not tapped.");
  }
  return lines.join("\n");
}
