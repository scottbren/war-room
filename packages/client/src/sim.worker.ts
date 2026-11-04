import { MapFile } from "@war-room/content";
import { createNav, createSim } from "@war-room/sim";
import type { Sim, Snapshot } from "@war-room/sim";
import mapJson from "../../content/maps/charon.json";
import navmeshUrl from "../../content/generated/charon.navmesh.bin?url";
import type { FromWorker, ToWorker } from "./protocol";
import { withDemoOperator } from "./scenario";

/** Runs the simulation at 10 Hz off the main thread. */
const TICK_MS = 100;
const post = (message: FromWorker): void => self.postMessage(message);

let sim: Sim | undefined;
let nav: Awaited<ReturnType<typeof createNav>> | undefined;
let last: Snapshot | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

async function init(seed: number): Promise<void> {
  const map = MapFile.parse(mapJson);
  const data = new Uint8Array(await (await fetch(navmeshUrl)).arrayBuffer());
  nav = await createNav({ data, map });
  sim = createSim({ seed, map: withDemoOperator(map), nav });
  const first = sim.step();
  last = first.snapshot;
  post({ type: "ready", snapshot: first.snapshot });
  clearInterval(timer);
  timer = setInterval(() => {
    try {
      const out = sim!.step();
      last = out.snapshot;
      post({ type: "tick", snapshot: out.snapshot, events: out.events });
    } catch (e) {
      post({ type: "error", message: String(e) });
      clearInterval(timer);
    }
  }, TICK_MS);
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      void init(message.seed).catch((e: unknown) => post({ type: "error", message: String(e) }));
    } else if (sim && nav && last) {
      const to = message.candidates.find((p) => nav!.isWalkable(p));
      // A command at the last completed tick applies in the next step.
      if (to) sim.enqueue({ kind: "move", tick: last.tick, entity: message.entity, to });
    }
  } catch (e) {
    post({ type: "error", message: String(e) });
  }
};
