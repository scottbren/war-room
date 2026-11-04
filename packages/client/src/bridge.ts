import type { Pos, SimEvent, Snapshot } from "@war-room/sim";
import type { FromWorker, ToWorker } from "./protocol";

/** One unit as drawn this frame. */
export interface RenderUnit {
  id: string;
  side: Snapshot["entities"][number]["side"];
  floor: Snapshot["entities"][number]["pos"]["floor"];
  x: number;
  y: number;
  /** Degrees, clockwise from north. */
  facing: number;
  state: Snapshot["entities"][number]["state"];
  health: number;
}

/** Shortest-way blend between two compass angles in degrees. */
const lerpAngle = (a: number, b: number, t: number): number => {
  const delta = ((((b - a) % 360) + 540) % 360) - 180;
  return a + delta * t;
};

/** Units blended between two snapshots (alpha 0 = previous, 1 = latest). New units, and units that changed floor, jump. */
export function interpolateSnapshots(prev: Snapshot | undefined, next: Snapshot, alpha: number): RenderUnit[] {
  const t = Math.min(1, Math.max(0, alpha));
  const before = new Map(prev?.entities.map((e) => [e.id, e]));
  return next.entities.map((e) => {
    const p = before.get(e.id);
    const blend = p !== undefined && p.pos.floor === e.pos.floor;
    return {
      id: e.id,
      side: e.side,
      floor: e.pos.floor,
      x: blend ? p.pos.x + (e.pos.x - p.pos.x) * t : e.pos.x,
      y: blend ? p.pos.y + (e.pos.y - p.pos.y) * t : e.pos.y,
      facing: blend ? lerpAngle(p.facing, e.facing, t) : e.facing,
      state: e.state,
      health: e.health,
    };
  });
}

/** The slice of the Worker API the bridge uses (so tests can pass a stand-in). */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  onmessage: ((event: { data: FromWorker }) => void) | null;
  terminate(): void;
}

/** Keeps the last two snapshots from the sim worker and hands out interpolated positions for each frame. */
export class SimBridge {
  ready = false;
  tick = 0;
  onEvents: ((events: SimEvent[]) => void) | null = null;
  onError: ((message: string) => void) | null = null;
  private prev: Snapshot | undefined;
  private latest: Snapshot | undefined;
  private latestAt = 0;
  /** Time between the last two snapshots, so a late tick does not make units speed up. */
  private interval = 100;

  constructor(
    private readonly worker: WorkerLike,
    private readonly clock: () => number,
  ) {
    worker.onmessage = (event) => this.receive(event.data);
  }

  start(seed: number): void {
    this.worker.postMessage({ type: "init", seed });
  }

  moveTo(entity: string, candidates: Pos[]): void {
    this.worker.postMessage({ type: "moveTo", entity, candidates });
  }

  /** The latest raw snapshot (simulation truth: for debug and overlays that filter it). */
  get snapshot(): Snapshot | undefined {
    return this.latest;
  }

  /** Units for a frame drawn at time `now` (same clock as the constructor). */
  units(now: number): RenderUnit[] {
    if (!this.latest) return [];
    return interpolateSnapshots(this.prev, this.latest, (now - this.latestAt) / this.interval);
  }

  dispose(): void {
    this.worker.onmessage = null;
    this.worker.terminate();
  }

  private receive(message: FromWorker): void {
    if (message.type === "error") {
      this.onError?.(message.message);
      return;
    }
    const at = this.clock();
    if (message.type === "tick" && this.latest) this.interval = Math.min(400, Math.max(50, at - this.latestAt));
    this.prev = message.type === "tick" ? this.latest : undefined;
    this.latest = message.snapshot;
    this.latestAt = at;
    this.tick = message.snapshot.tick;
    this.ready = true;
    if (message.type === "tick") this.onEvents?.(message.events);
  }
}
