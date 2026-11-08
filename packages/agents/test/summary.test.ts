import { describe, expect, it } from "vitest";
import { MapFile } from "@war-room/content";
import { createKnowledge } from "@war-room/sim";
import type { Knowledge, SimEvent, Snapshot } from "@war-room/sim";
import testbed from "../../content/maps/testbed.json";
import { summarizeKnowledge } from "../src/summary";

const map = MapFile.parse(testbed);
// Rooms on the testbed's ground floor: Hall x 14-24, y 6-12; Lobby x 6-14, y 6-12; Study x 14-19, y 12-18.
const HALL = { x: 19, y: 9 }, LOBBY = { x: 10, y: 9 }, STUDY = { x: 16, y: 15 };

type Ent = { id: string; side: "operator" | "defender"; at: { x: number; y: number }; state?: "idle" | "down" };
const snap = (tick: number, ents: Ent[], extra: Partial<Snapshot> = {}): Snapshot => ({
  tick,
  entities: ents.map((e) => ({ id: e.id, side: e.side, pos: { floor: "ground", ...e.at }, facing: 0, health: 100, state: e.state ?? "idle" })),
  doors: [],
  devices: [],
  shutters: [],
  alert: 0,
  hubOnline: true,
  ...extra,
});
let n = 0;
const base = (tick: number) => ({ id: `${tick}.${n++}`, tick, v: 1 as const });

function fight(): Knowledge {
  const k = createKnowledge(map, "operator");
  const ents: Ent[] = [
    { id: "op.alpha.1", side: "operator", at: HALL },
    { id: "def.test.1", side: "defender", at: LOBBY },
    { id: "def.test.2", side: "defender", at: STUDY }, // exists, but nobody on our side has seen or heard it
  ];
  const events: SimEvent[] = [
    { ...base(5), type: "contact", observer: "op.alpha.1", target: "def.test.1" },
    { ...base(5), type: "shot", shooter: "def.test.1", at: { floor: "ground", ...HALL }, hit: true },
    { ...base(4), type: "noise", observer: "op.alpha.1", at: { floor: "ground", ...STUDY }, kind: "shot" },
  ];
  k.update(snap(5, ents), events);
  return k;
}

describe("summarizeKnowledge", () => {
  it("describes what the operators know, with room names", () => {
    const text = summarizeKnowledge(map, fight(), 5);
    expect(text).toContain("Our units: op.alpha.1 in Hall (ground)");
    expect(text).toContain("In view now: def.test.1 in Lobby (ground)");
    expect(text).toContain("Gunfire seen: def.test.1 fired at Hall (ground), hit");
    expect(text).toContain("Heard: gunfire near Study (ground)");
    expect(text).toContain("Security cameras: not tapped.");
  });

  it("never mentions a unit the side has not seen (no leaks from truth)", () => {
    const text = summarizeKnowledge(map, fight(), 5);
    expect(text).not.toContain("def.test.2");
  });

  it("moves a unit from 'in view' to 'last known' once it has been out of sight a while, with how long ago", () => {
    const k = fight();
    k.update(snap(105, [{ id: "op.alpha.1", side: "operator", at: HALL }, { id: "def.test.1", side: "defender", at: STUDY }]), []);
    const text = summarizeKnowledge(map, k, 105);
    expect(text).not.toContain("In view now");
    expect(text).toContain("Last known (may have moved): def.test.1 in Lobby (ground), 10 s ago"); // where it was last SEEN, not where it is
    expect(text).toContain("Time: 10 s into the raid.");
  });

  it("drops sounds and shots older than half a minute", () => {
    const k = fight();
    k.update(snap(400, [{ id: "op.alpha.1", side: "operator", at: HALL }]), []);
    const text = summarizeKnowledge(map, k, 400);
    expect(text).not.toContain("Heard:");
    expect(text).not.toContain("Gunfire seen:");
  });

  it("marks a downed unit", () => {
    const k = createKnowledge(map, "operator");
    k.update(snap(3, [{ id: "op.alpha.1", side: "operator", at: HALL, state: "down" }]), []);
    expect(summarizeKnowledge(map, k, 3)).toContain("op.alpha.1 in Hall (ground) (down)");
  });

  it("says so when nothing is known, and names outdoors for a spot outside every room", () => {
    const empty = createKnowledge(map, "operator");
    expect(summarizeKnowledge(map, empty, 0)).toContain("Our units: none known.");
    const k = createKnowledge(map, "operator");
    k.update(snap(1, [{ id: "op.alpha.1", side: "operator", at: { x: 100, y: 100 } }]), []);
    expect(summarizeKnowledge(map, k, 1)).toContain("op.alpha.1 in outdoors (ground)");
  });

  it("keeps it compact: at most eight per category, and says how many more", () => {
    const k = createKnowledge(map, "operator");
    const ents: Ent[] = [{ id: "op.alpha.1", side: "operator", at: HALL }];
    const events: SimEvent[] = [];
    for (let i = 1; i <= 12; i++) {
      ents.push({ id: `def.test.${String(i).padStart(2, "0")}`, side: "defender", at: LOBBY });
      events.push({ ...base(2), type: "contact", observer: "op.alpha.1", target: `def.test.${String(i).padStart(2, "0")}` });
    }
    k.update(snap(2, ents), events);
    const text = summarizeKnowledge(map, k, 2);
    expect(text).toContain("and 4 more");
    expect(text.match(/def\.test\.\d\d/g)).toHaveLength(8);
  });

  it("reports the camera network once tapped: how many live and what they show", () => {
    const k = fight();
    k.tapCameras();
    const text = summarizeKnowledge(map, k, 5);
    expect(text).toMatch(/Security cameras: tapped, \d+ of \d+ live/);
    expect(text).not.toContain("not tapped");
  });

  it("is the same text for the same knowledge and time", () => {
    expect(summarizeKnowledge(map, fight(), 5)).toBe(summarizeKnowledge(map, fight(), 5));
  });
});
