import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { MAPS, mapNameFromSearch } from "../src/maps";

describe("map choice", () => {
  it("shows CHARON unless the page asks for the testbed", () => {
    expect(mapNameFromSearch("")).toBe("charon");
    expect(mapNameFromSearch("?map=testbed")).toBe("testbed");
    expect(mapNameFromSearch("?gl=webgl2&map=testbed")).toBe("testbed");
    expect(mapNameFromSearch("?map=nonsense")).toBe("charon");
  });

  it("has a valid map under each name, whose id is the name (the worker picks the navmesh by it)", () => {
    for (const [name, entry] of Object.entries(MAPS)) expect(MapFile.parse(entry.json).id).toBe(name);
  });
});
