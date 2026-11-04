import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createNav } from "../../sim/src/nav";
import type { Nav } from "../../sim/src/nav";
import { parseRecording, replay } from "../src/replay";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const map = MapFile.parse(JSON.parse(read("../../content/maps/charon.json").toString("utf8")));
let nav: Nav;
beforeAll(async () => {
  nav = await createNav({ data: new Uint8Array(read("../../content/generated/charon.navmesh.bin")), map });
});

describe("T12 reference replay (the list the browsers must reproduce)", () => {
  const recording = parseRecording(read("../../content/generated/t12.recording.json").toString("utf8"));
  const expected = JSON.parse(read("../../content/generated/t12.hashes.json").toString("utf8")) as string[];

  it("is a real run: many routed moves over the whole duration", () => {
    expect(recording.ticks).toBeGreaterThanOrEqual(1000);
    expect(recording.commands.length).toBeGreaterThan(40);
    expect(expected).toHaveLength(recording.ticks);
    expect(new Set(expected).size).toBeGreaterThan(recording.ticks * 0.8); // the state really changes tick to tick
  });

  it("replays in Node to exactly the committed per-tick hash list", () => {
    expect(replay(recording, map, nav)).toEqual(expected);
  });

  it("is not the straight-line result: the navmesh changes the hashes", () => {
    expect(replay(recording, map)).not.toEqual(expected);
  });
});
