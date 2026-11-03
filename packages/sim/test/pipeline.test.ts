import { describe, expect, it } from "vitest";
import { pipeline } from "../src/pipeline";

describe("pipeline", () => {
  it("runs the systems in the order from the technical design", () => {
    expect(pipeline.map((system) => system.name)).toEqual([
      "commandsSystem",
      "aiSystem",
      "movementSystem",
      "perceptionSystem",
      "smartHomeSystem",
      "combatSystem",
      "moraleSystem",
      "objectivesSystem",
      "emitSystem",
    ]);
  });
});
