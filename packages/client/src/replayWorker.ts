import { MapFile } from "@war-room/content";
import { createNav, createSim } from "@war-room/sim";
import type { Command } from "@war-room/sim";
import mapJson from "../../content/maps/charon.json";
import navmeshUrl from "../../content/generated/charon.navmesh.bin?url";
import recordingJson from "../../content/generated/t12.recording.json";

/** T12: replays the recorded raid inside a worker and returns the state hash after every tick. */
type Recording = { seed: number; ticks: number; commands: { at: number; command: Command }[] };

self.onmessage = async () => {
  try {
    const recording = recordingJson as unknown as Recording;
    const map = MapFile.parse(mapJson);
    const nav = await createNav({ data: new Uint8Array(await (await fetch(navmeshUrl)).arrayBuffer()), map });
    const sim = createSim({ seed: recording.seed, map, nav });
    const hashes: string[] = [];
    let next = 0;
    for (let t = 0; t < recording.ticks; t++) {
      while (next < recording.commands.length && recording.commands[next]!.at === t) sim.enqueue(recording.commands[next++]!.command);
      sim.step();
      hashes.push(sim.hash());
    }
    self.postMessage({ ok: true, inWorker: typeof document === "undefined", hashes });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e) });
  }
};
