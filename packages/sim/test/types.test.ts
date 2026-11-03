import { describe, expect, it } from "vitest";
import { createSim } from "../src";
import type { MapFile } from "@war-room/content";
import type { Command } from "../src";

describe("sim contract", () => {
  it("createSim is a stub that throws until T3", () => {
    expect(() => createSim({ seed: 1, map: {} as MapFile })).toThrow("not implemented");
  });

  it("Command union is constructible", () => {
    const cmd: Command = { kind: "move", tick: 0, entity: "op.alpha.1", to: { floor: "ground", x: 1, y: 2 } };
    expect(cmd.kind).toBe("move");
  });
});
