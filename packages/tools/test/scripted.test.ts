import { describe, expect, it } from "vitest";
import { runScripted } from "../src/scripted";
import { makeSandboxMap } from "../src/sandboxMap";

describe("runScripted", () => {
  const map = makeSandboxMap();

  it("is fully deterministic for a seed", () => {
    const a = runScripted({ map, seed: 5, ticks: 300 });
    const b = runScripted({ map, seed: 5, ticks: 300 });
    expect(b).toEqual(a);
  });

  it("returns one hash per tick and a final hash equal to the last", () => {
    const run = runScripted({ map, seed: 5, ticks: 120 });
    expect(run.hashes).toHaveLength(120);
    expect(run.finalHash).toBe(run.hashes[119]);
  });

  it("issues random moves that the sim accepts and acts on", () => {
    const run = runScripted({ map, seed: 5, ticks: 300 });
    expect(run.eventCounts["moved"]).toBeGreaterThan(100);
    expect(run.eventCounts["arrived"]).toBeGreaterThan(0);
    expect(run.eventCounts["commandRejected"] ?? 0).toBe(0);
    expect(run.recording.commands.every((c) => c.command.kind === "move")).toBe(true);
  });

  it("only sends targets inside the map bounds", () => {
    const run = runScripted({ map, seed: 11, ticks: 400 });
    for (const { command: c } of run.recording.commands) {
      if (c.kind !== "move") continue;
      expect(c.to.x).toBeGreaterThanOrEqual(map.bounds.min.x);
      expect(c.to.x).toBeLessThanOrEqual(map.bounds.max.x);
      expect(c.to.y).toBeGreaterThanOrEqual(map.bounds.min.y);
      expect(c.to.y).toBeLessThanOrEqual(map.bounds.max.y);
    }
  });

  it("rejects bad options", () => {
    expect(() => runScripted({ map, seed: 1.5, ticks: 10 })).toThrow();
    expect(() => runScripted({ map, seed: 1, ticks: -1 })).toThrow();
  });
});
