import { MapFile, Mission } from "@war-room/content";
import { createNav, createSim } from "@war-room/sim";
import type { Sim, Snapshot } from "@war-room/sim";
import { MAPS, isMapName } from "./maps";
import type { FromWorker, ToWorker } from "./protocol";
import { withDemoOperator, withoutDefenders } from "./scenario";

/** Runs the simulation at 10 Hz off the main thread. */
const TICK_MS = 100;
const post = (message: FromWorker): void => self.postMessage(message);

let sim: Sim | undefined;
let nav: Awaited<ReturnType<typeof createNav>> | undefined;
let last: Snapshot | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

async function init(seed: number, mapName: string, peaceful: boolean): Promise<void> {
  const chosen = MAPS[isMapName(mapName) ? mapName : "charon"];
  const map = MapFile.parse(chosen.json);
  const navmeshUrl = chosen.navmeshUrl;
  const data = new Uint8Array(await (await fetch(navmeshUrl)).arrayBuffer());
  nav = await createNav({ data, map });
  sim = createSim({ seed, map: withDemoOperator(peaceful ? withoutDefenders(map) : map), mission: Mission.parse(chosen.mission), nav });
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
      void init(message.seed, message.map, message.peaceful === true).catch((e: unknown) => post({ type: "error", message: String(e) }));
    } else if (sim && nav && last) {
      const to = message.candidates.find((p) => nav!.isWalkable(p));
      // A command at the last completed tick applies in the next step.
      if (to) sim.enqueue({ kind: "move", tick: last.tick, entity: message.entity, to });
    }
  } catch (e) {
    post({ type: "error", message: String(e) });
  }
};
