import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { bakeNavmesh, navmeshPath } from "../src/bake-navmesh";

const map = MapFile.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/maps/charon.json", import.meta.url)), "utf8")));

describe("bake-navmesh", () => {
  it("the committed navmesh is exactly what the baker produces from the current map (run pnpm bake-navmesh if this fails)", async () => {
    const fresh = await bakeNavmesh(map);
    const committed = new Uint8Array(readFileSync(navmeshPath));
    expect(fresh.length).toBe(committed.length);
    expect(Buffer.from(fresh).equals(Buffer.from(committed))).toBe(true);
  }, 60_000);
});
