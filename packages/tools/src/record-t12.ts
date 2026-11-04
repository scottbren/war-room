import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MapFile } from "@war-room/content";
import { createNav } from "@war-room/sim";
import { replay, stringifyRecording } from "./replay";
import { runScripted } from "./scripted";

/**
 * Writes the reference replay for the cross-browser determinism check (T12): a scripted CHARON raid with
 * navmesh movement, plus its per-tick hash list from Node. `pnpm record-t12` regenerates both files; a test
 * keeps them honest.
 */
const generated = (name: string): string => fileURLToPath(new URL(`../../content/generated/${name}`, import.meta.url));

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url)), "utf8")));
const nav = await createNav({ data: new Uint8Array(readFileSync(generated("charon.navmesh.bin"))), map });
const run = runScripted({ map, seed: 12, ticks: 1200, nav });
const hashes = replay(run.recording, map, nav);
if (hashes.join() !== run.hashes.join()) throw new Error("replay does not reproduce the live run");

mkdirSync(dirname(generated("t12.recording.json")), { recursive: true });
writeFileSync(generated("t12.recording.json"), stringifyRecording(run.recording) + "\n");
writeFileSync(generated("t12.hashes.json"), JSON.stringify(hashes) + "\n");
console.log(`wrote t12 recording (${run.recording.commands.length} commands, ${run.recording.ticks} ticks), final hash ${run.finalHash}`);
