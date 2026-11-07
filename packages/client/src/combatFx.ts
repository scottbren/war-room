/**
 * Pure helpers for showing a fight. They read only what the operators know (knowledge shots and noises, the health the
 * snapshot carries); nothing here decides anything about the fight.
 */

/** Anything with the tick it happened on. */
interface Timed {
  tick: number;
}

/** The entries newer than `after`, in order (knowledge keeps a rolling window, so each tick we draw only what is new). */
export function freshSince<T extends Timed>(items: readonly T[], after: number): T[] {
  return items.filter((i) => i.tick > after);
}

export type Wound = "healthy" | "wounded" | "badly";

/** The same bands the sim uses for slower walking and worse aim (60 and 30), so what is drawn matches what happens. */
export function woundOf(health: number, down: boolean): Wound {
  if (down) return "healthy"; // (a downed unit is drawn lying flat, not tinted)
  return health <= 30 ? "badly" : health <= 60 ? "wounded" : "healthy";
}

/** Blend a side's colour toward blood red: none, some, or most. */
export function woundColor(base: readonly [number, number, number], wound: Wound): [number, number, number] {
  const k = wound === "badly" ? 0.6 : wound === "wounded" ? 0.3 : 0;
  const red = [0.55, 0.03, 0.03] as const;
  return [base[0] + (red[0] - base[0]) * k, base[1] + (red[1] - base[1]) * k, base[2] + (red[2] - base[2]) * k];
}

/** Tracer colour: hot orange-red for a hit, pale yellow for a miss. */
export function tracerColor(hit: boolean): [number, number, number] {
  return hit ? [1, 0.35, 0.15] : [1, 0.9, 0.5];
}

/** How long a tracer stays on screen. */
export const TRACER_MS = 220;

/** Opacity of a tracer `age` ms after it was fired (1 → 0), 0 once it is gone. */
export function tracerAlpha(age: number): number {
  return age < 0 || age >= TRACER_MS ? 0 : 1 - age / TRACER_MS;
}

/** Minimal slice of the Web Audio API the gunfire uses, so tests can pass a stand-in. */
export interface AudioLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  resume(): Promise<void>;
  createBuffer(channels: number, length: number, rate: number): { getChannelData(c: number): Float32Array };
  createBufferSource(): { buffer: unknown; connect(n: unknown): void; start(t: number): void };
  createGain(): { gain: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void };
  readonly destination: unknown;
}

/** A tiny gunshot: a 120 ms burst of noise with a fast decay. Noise comes from a fixed sequence, not Math.random (keeps the client reproducible too). */
export function createGunfire(make: () => AudioLike | undefined): { unlock(): void; shot(): boolean } {
  let ctx: AudioLike | undefined;
  let buffer: unknown;
  const get = (): AudioLike | undefined => (ctx ??= make());
  return {
    /** Call from a user gesture: browsers keep audio silent until then. */
    unlock() {
      const c = get();
      if (c && c.state === "suspended") void c.resume();
    },
    /** Play one shot; false if audio is unavailable or not yet unlocked. */
    shot() {
      const c = get();
      if (!c || c.state !== "running") return false;
      if (!buffer) {
        const length = Math.floor(c.sampleRate * 0.12);
        const b = c.createBuffer(1, length, c.sampleRate);
        const data = b.getChannelData(0);
        let x = 12345;
        for (let i = 0; i < length; i++) {
          x = (Math.imul(x, 1103515245) + 12345) >>> 0;
          data[i] = ((x / 4294967296) * 2 - 1) * (1 - i / length);
        }
        buffer = b;
      }
      const src = c.createBufferSource();
      src.buffer = buffer;
      const g = c.createGain();
      g.gain.setValueAtTime(0.35, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
      src.connect(g);
      g.connect(c.destination);
      src.start(c.currentTime);
      return true;
    },
  };
}
