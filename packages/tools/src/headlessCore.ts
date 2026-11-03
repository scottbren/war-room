import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MapFile } from "@war-room/content";
import { runScripted } from "./scripted";
import { makeSandboxMap } from "./sandboxMap";

export interface HeadlessArgs {
  seeds: number;
  ticks: number;
  map: string;
}

export interface RunSummary {
  seed: number;
  ticks: number;
  finalHash: string;
  eventCounts: Record<string, number>;
  durationMs: number;
}

export interface HeadlessSummary {
  map: string;
  mapVersion: number;
  seeds: number;
  ticks: number;
  runs: RunSummary[];
}

const DEFAULTS: HeadlessArgs = { seeds: 10, ticks: 600, map: "sandbox" };

function positiveInt(flag: string, value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || value.trim() === "" || !Number.isInteger(n) || n < 1) {
    throw new Error(`--${flag} needs a positive whole number, got ${value === undefined ? "nothing" : `"${value}"`}`);
  }
  return n;
}

/** Parses `--seeds N --ticks T --map name`. A leading bare `--` (from pnpm) is ignored. */
export function parseArgs(argv: readonly string[]): HeadlessArgs {
  const args = { ...DEFAULTS };
  const list = argv[0] === "--" ? argv.slice(1) : argv;
  for (let i = 0; i < list.length; i += 2) {
    const flag = list[i] as string;
    const value = list[i + 1];
    switch (flag) {
      case "--seeds":
        args.seeds = positiveInt("seeds", value);
        break;
      case "--ticks":
        args.ticks = positiveInt("ticks", value);
        break;
      case "--map":
        if (value === undefined) throw new Error("--map needs a map name");
        args.map = value;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }
  return args;
}

const MAPS_DIR = fileURLToPath(new URL("../../content/maps/", import.meta.url));

/** Loads `sandbox` (built in) or `packages/content/maps/<name>.json`, validated against the schema. */
export function loadMap(name: string): MapFile {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
    throw new Error(`Invalid map name "${name}" (letters, digits, - and _ only)`);
  }
  if (name === "sandbox") return makeSandboxMap();

  let text: string;
  try {
    text = readFileSync(`${MAPS_DIR}${name}.json`, "utf8");
  } catch {
    throw new Error(`Map "${name}" not found (looked for packages/content/maps/${name}.json). Try --map sandbox.`);
  }
  return MapFile.parse(JSON.parse(text));
}

/** Runs seeds 1..N on the scripted driver and summarizes each. */
export function summarize(args: HeadlessArgs): HeadlessSummary {
  const map = loadMap(args.map);
  const runs: RunSummary[] = [];
  for (let seed = 1; seed <= args.seeds; seed++) {
    const started = performance.now();
    const run = runScripted({ map, seed, ticks: args.ticks });
    runs.push({
      seed,
      ticks: args.ticks,
      finalHash: run.finalHash,
      eventCounts: run.eventCounts,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    });
  }
  return { map: map.id, mapVersion: map.version, seeds: args.seeds, ticks: args.ticks, runs };
}
