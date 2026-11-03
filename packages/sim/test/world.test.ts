import { describe, expect, it } from "vitest";
import { addEntity, createWorld, sortedEntities, sortedIds } from "../src/world";
import type { Entity } from "../src/world";

const ent = (id: string): Entity => ({
  id,
  side: "operator",
  pos: { floor: "ground", xCm: 0, yCm: 0 },
  facing: 0,
  health: 100,
  state: "idle",
});

describe("world", () => {
  it("starts empty at tick 0", () => {
    const w = createWorld();
    expect(w.tick).toBe(0);
    expect(sortedIds(w)).toEqual([]);
  });

  it("always iterates entities in sorted id order, whatever the insertion order", () => {
    const a = createWorld();
    for (const id of ["op.b", "fam.son", "op.a", "def.vet.10", "def.vet.2"]) addEntity(a, ent(id));
    const b = createWorld();
    for (const id of ["def.vet.2", "op.a", "def.vet.10", "fam.son", "op.b"]) addEntity(b, ent(id));

    const expected = ["def.vet.10", "def.vet.2", "fam.son", "op.a", "op.b"];
    expect(sortedIds(a)).toEqual(expected);
    expect(sortedIds(b)).toEqual(expected);
    expect(sortedEntities(a).map((e) => e.id)).toEqual(expected);
  });

  it("rejects duplicate entity ids", () => {
    const w = createWorld();
    addEntity(w, ent("op.a"));
    expect(() => addEntity(w, ent("op.a"))).toThrow(/duplicate/i);
  });
});
