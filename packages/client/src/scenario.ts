import type { MapFile } from "@war-room/content";

/** The unit the T10 demo controls. */
export const DEMO_OPERATOR = "op.alpha.1";

/** The map plus one operator on the helipad (a debug scenario: real spawns come with the mission data). */
export function withDemoOperator(map: MapFile): MapFile {
  if (map.markers.some((m) => m.tags.includes(`entity:${DEMO_OPERATOR}`))) return map; // a map with its own operators (TESTBED)
  return {
    ...map,
    markers: [
      ...map.markers,
      { id: "m.spawn.demo", floor: "grounds", kind: "spawn", at: { x: 48, y: 68 }, tags: [`entity:${DEMO_OPERATOR}`, "side:operator"] },
    ],
  };
}

/** The map without its defenders (the `?peaceful=1` dev switch). */
export function withoutDefenders(map: MapFile): MapFile {
  return { ...map, markers: map.markers.filter((m) => !m.tags.includes("side:defender")) };
}
