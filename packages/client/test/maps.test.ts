import { describe, expect, it } from "vitest";
import { MapFile, Mission } from "@war-room/content";
import { MAPS, mapNameFromSearch, peacefulFromSearch } from "../src/maps";
import { withoutDefenders } from "../src/scenario";

describe("map choice", () => {
  it("shows CHARON unless the page asks for the testbed", () => {
    expect(mapNameFromSearch("")).toBe("charon");
    expect(mapNameFromSearch("?map=testbed")).toBe("testbed");
    expect(mapNameFromSearch("?gl=webgl2&map=testbed")).toBe("testbed");
    expect(mapNameFromSearch("?map=nonsense")).toBe("charon");
  });

  it("only drops the defenders when the page asks for it", () => {
    expect(peacefulFromSearch("")).toBe(false);
    expect(peacefulFromSearch("?map=testbed")).toBe(false);
    expect(peacefulFromSearch("?peaceful=1")).toBe(true);
    expect(peacefulFromSearch("?map=testbed&peaceful=1")).toBe(true);
    const map = MapFile.parse(MAPS.testbed.json);
    const peaceful = withoutDefenders(map);
    expect(map.markers.some((m) => m.tags.includes("side:defender"))).toBe(true);
    expect(peaceful.markers.some((m) => m.tags.includes("side:defender"))).toBe(false);
    expect(peaceful.markers.some((m) => m.tags.includes("side:operator"))).toBe(true);
  });

  it("has a valid map under each name, whose id is the name (the worker picks the navmesh by it)", () => {
    for (const [name, entry] of Object.entries(MAPS)) {
      expect(MapFile.parse(entry.json).id).toBe(name);
      expect(Mission.parse(entry.mission).mapId).toBe(name);
    }
  });
});
