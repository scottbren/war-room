import { describe, expect, it } from "vitest";
import { createSim } from "../src";
import type { Command, Sim } from "../src";
import { makeTestMap } from "./helpers/testMap";

describe("sim contract", () => {
  it("createSim returns an object implementing the Sim interface", () => {
    const sim: Sim = createSim({ seed: 1, map: makeTestMap() });
    for (const method of ["enqueue", "step", "hash", "serialize", "restore"] as const) {
      expect(typeof sim[method]).toBe("function");
    }
  });

  it("Command union is constructible", () => {
    const cmd: Command = { kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 1, y: 2 } };
    expect(cmd.kind).toBe("move");
  });
});
