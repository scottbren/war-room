import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * T12: the recorded raid, replayed inside a Web Worker with the real navmesh, must produce exactly the per-tick hash list
 * that Node produced (content/generated/t12.hashes.json, kept honest by tools/test/t12-replay.test.ts).
 */
const expected = JSON.parse(readFileSync(fileURLToPath(new URL("../../content/generated/t12.hashes.json", import.meta.url)), "utf8")) as string[];

test("worker replay hashes match Node", async ({ page }) => {
  await page.goto("/replay-debug.html");
  await page.waitForFunction(() => (window as unknown as { __replayHashes?: string[]; __replayError?: string }).__replayHashes !== undefined || (window as unknown as { __replayError?: string }).__replayError !== undefined, undefined, { timeout: 60_000 });
  const error = await page.evaluate(() => (window as unknown as { __replayError?: string }).__replayError);
  expect(error).toBeUndefined();
  const hashes = await page.evaluate(() => (window as unknown as { __replayHashes: string[] }).__replayHashes);
  expect(hashes).toHaveLength(expected.length);
  const firstDifference = hashes.findIndex((h, i) => h !== expected[i]);
  expect(firstDifference, `first diverging tick (0-based): ${firstDifference}`).toBe(-1);
});
