import { describe, expect, it } from "vitest";
import { pipeline } from "../src/pipeline";

describe("pipeline", () => {
  it("runs the systems in the order from the technical design", () => {
    expect(pipeline.map((system) => system.name)).toEqual([
      "commandsSystem",
      "operatorSystem",
      "movementSystem",
      "perceptionSystem",
      "smartHomeSystem",
      "combatSystem",
      "defenderMindsSystem",
      "moraleSystem",
      "objectivesSystem",
      "emitSystem",
    ]);
  });
});
