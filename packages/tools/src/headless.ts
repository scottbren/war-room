import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs, summarize } from "./headlessCore";

/** Usage: pnpm run:headless -- --seeds 100 --ticks 600 --map sandbox */
function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const summary = summarize(args);
  const seconds = (performance.now() - started) / 1000;

  const outDir = fileURLToPath(new URL("../../../out/", import.meta.url));
  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}headless-summary.json`;
  writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);

  const distinct = new Set(summary.runs.map((r) => r.finalHash)).size;
  console.log(
    `${summary.runs.length} raids x ${args.ticks} ticks on "${summary.map}" in ${seconds.toFixed(1)}s ` +
      `(${distinct} distinct final hashes). Summary: out/headless-summary.json`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
