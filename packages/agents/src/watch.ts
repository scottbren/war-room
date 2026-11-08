import type { MapFile } from "@war-room/content";
import type { Knowledge } from "@war-room/sim";
import { describePlace } from "./summary";

export type HappeningKind = "contact" | "gunfire" | "casualty";

/** Something worth an advisor's attention, found by comparing what the operators know now with what they knew before. */
export interface Happening {
  kind: HappeningKind;
  /** Identifies the same event over again (the same unit spotted, gunfire in the same room); the policy uses it to not repeat. */
  key: string;
  /** 1 minor to 3 serious. */
  importance: number;
  tick: number;
  /** One plain sentence for the advisor's prompt. */
  description: string;
}

/**
 * Watches the operators' knowledge (never truth) and reports what is new on each poll: a casualty among our units, an
 * enemy newly in view, gunfire seen or heard. Call `poll` once per tick, in order.
 */
export function createWatcher(map: MapFile, knowledge: Knowledge): { poll(now: number): Happening[] } {
  const liveEnemies = new Set<string>();
  const downOwn = new Set<string>();
  let shotsAfter = -1;
  let noisesAfter = -1;
  return {
    poll(now) {
      const out: Happening[] = [];
      const units = knowledge.units();

      for (const u of units) {
        if (u.own && u.down && !downOwn.has(u.id)) {
          downOwn.add(u.id);
          out.push({ kind: "casualty", key: `casualty:${u.id}`, importance: 3, tick: now, description: `${u.id}, one of ours, is down in ${describePlace(map, u.floor, u.x, u.y)}.` });
        }
      }

      const nowLive = new Set<string>();
      for (const u of units) {
        if (u.own || !u.live || u.down) continue;
        nowLive.add(u.id);
        if (!liveEnemies.has(u.id)) out.push({ kind: "contact", key: `contact:${u.id}`, importance: 2, tick: now, description: `Contact: ${u.id} spotted in ${describePlace(map, u.floor, u.x, u.y)}.` });
      }
      liveEnemies.clear();
      for (const id of nowLive) liveEnemies.add(id);

      const shots = knowledge.shots().filter((s) => s.tick > shotsAfter);
      const heard = knowledge.noises().filter((n) => n.kind === "shot" && n.tick > noisesAfter);
      for (const s of shots) shotsAfter = Math.max(shotsAfter, s.tick);
      for (const n of heard) noisesAfter = Math.max(noisesAfter, n.tick);
      const first = shots[0];
      const sound = heard[0];
      if (first) {
        const place = describePlace(map, first.floor, first.x, first.y);
        out.push({ kind: "gunfire", key: `gunfire:${place}`, importance: 2, tick: now, description: `Gunfire: ${first.shooter} fired at ${place} and ${first.hit ? "hit" : "missed"}.` });
      } else if (sound) {
        const place = describePlace(map, sound.floor, sound.x, sound.y);
        out.push({ kind: "gunfire", key: `gunfire:${place}`, importance: 2, tick: now, description: `Gunfire heard near ${place}.` });
      }
      return out;
    },
  };
}
