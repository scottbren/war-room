import { describe, expect, it } from "vitest";
import { createKnowledge } from "@war-room/sim";
import type { SimEvent } from "@war-room/sim";
import { createWatcher } from "../src/watch";
import { HALL, LOBBY, STUDY, base, map, snap } from "./helpers";
import type { Ent } from "./helpers";

const alpha: Ent = { id: "op.alpha.1", side: "operator", at: HALL };
const guard = (at = LOBBY): Ent => ({ id: "def.test.1", side: "defender", at });

function setup() {
  const k = createKnowledge(map, "operator");
  const w = createWatcher(map, k);
  return { k, w };
}

describe("watcher", () => {
  it("reports nothing while nothing new is known", () => {
    const { k, w } = setup();
    k.update(snap(1, [alpha, guard()]), []);
    expect(w.poll(1)).toEqual([]);
  });

  it("reports a contact once when an enemy comes into view, not on every tick it stays", () => {
    const { k, w } = setup();
    const contact: SimEvent = { ...base(2), type: "contact", observer: "op.alpha.1", target: "def.test.1" };
    k.update(snap(2, [alpha, guard()]), [contact]);
    const first = w.poll(2);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: "contact", key: "contact:def.test.1", importance: 2 });
    expect(first[0]?.description).toBe("Contact: def.test.1 spotted in Lobby (ground).");
    k.update(snap(5, [alpha, guard()]), [{ ...base(5), type: "contact", observer: "op.alpha.1", target: "def.test.1" }]);
    expect(w.poll(5)).toEqual([]);
  });

  it("reports the same enemy again after he has been out of sight and reappears", () => {
    const { k, w } = setup();
    k.update(snap(2, [alpha, guard()]), [{ ...base(2), type: "contact", observer: "op.alpha.1", target: "def.test.1" }]);
    w.poll(2);
    k.update(snap(40, [alpha, guard()]), []); // not live any more (no contact for a while)
    expect(w.poll(40)).toEqual([]);
    k.update(snap(60, [alpha, guard(STUDY)]), [{ ...base(60), type: "contact", observer: "op.alpha.1", target: "def.test.1" }]);
    expect(w.poll(60)).toMatchObject([{ kind: "contact", description: "Contact: def.test.1 spotted in Study (ground)." }]);
  });

  it("reports one of ours going down once, as a serious happening", () => {
    const { k, w } = setup();
    k.update(snap(3, [{ ...alpha, state: "down" }]), []);
    expect(w.poll(3)).toMatchObject([{ kind: "casualty", importance: 3, key: "casualty:op.alpha.1" }]);
    k.update(snap(4, [{ ...alpha, state: "down" }]), []);
    expect(w.poll(4)).toEqual([]);
  });

  it("reports gunfire it saw, naming who fired and whether it hit, once per new shot", () => {
    const { k, w } = setup();
    const events: SimEvent[] = [
      { ...base(5), type: "contact", observer: "op.alpha.1", target: "def.test.1" },
      { ...base(5), type: "shot", shooter: "def.test.1", at: { floor: "ground", ...HALL }, hit: false },
    ];
    k.update(snap(5, [alpha, guard()]), events);
    const out = w.poll(5);
    expect(out.find((h) => h.kind === "gunfire")).toMatchObject({ key: "gunfire:Hall (ground)", description: "Gunfire: def.test.1 fired at Hall (ground) and missed." });
    k.update(snap(6, [alpha, guard()]), []);
    expect(w.poll(6).some((h) => h.kind === "gunfire")).toBe(false);
  });

  it("reports gunfire it only heard, by where it seemed to come from", () => {
    const { k, w } = setup();
    k.update(snap(4, [alpha]), [{ ...base(4), type: "noise", observer: "op.alpha.1", at: { floor: "ground", ...STUDY }, kind: "shot" }]);
    expect(w.poll(4)).toMatchObject([{ kind: "gunfire", description: "Gunfire heard near Study (ground)." }]);
  });

  it("ignores footsteps and doors, and units it has never been told about", () => {
    const { k, w } = setup();
    k.update(snap(4, [alpha, guard()]), [
      { ...base(4), type: "noise", observer: "op.alpha.1", at: { floor: "ground", ...STUDY }, kind: "steps" },
      { ...base(4), type: "noise", observer: "op.alpha.1", at: { floor: "ground", ...STUDY }, kind: "door" },
    ]);
    expect(w.poll(4)).toEqual([]);
  });
});
