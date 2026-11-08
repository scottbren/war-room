import { describe, expect, it } from "vitest";
import { ADVISORS, advisor } from "../src/advisors";
import { cannedLine } from "../src/canned";
import type { Situation } from "../src/canned";

describe("advisors", () => {
  it("are the six from the design spec, each with a distinct id, a name, a role and a persona", () => {
    expect(ADVISORS.map((a) => a.id)).toEqual(["hale", "kessler", "navarro", "reyes", "cho", "adler"]);
    expect(new Set(ADVISORS.map((a) => a.id)).size).toBe(6);
    expect(new Set(ADVISORS.map((a) => a.name)).size).toBe(6);
    for (const a of ADVISORS) {
      expect(a.name.length, a.id).toBeGreaterThan(3);
      expect(a.title.length, a.id).toBeGreaterThan(3);
      expect(a.pushesFor.length, a.id).toBeGreaterThan(10);
      expect(a.blindSpot.length, a.id).toBeGreaterThan(10);
      expect(a.persona.length, a.id).toBeGreaterThan(200);
    }
  });

  it("each persona states what that advisor can and cannot know, so the fog holds", () => {
    for (const a of ADVISORS) expect(a.persona, a.id).toMatch(/you (do not|have no|know)/i);
  });

  it("look up by id, and refuse an unknown one", () => {
    expect(advisor("kessler").title).toBe("CIA director");
    expect(() => advisor("nobody" as never)).toThrow(/unknown advisor/);
  });
});

describe("canned lines", () => {
  const situations: Situation[] = ["ack", "react", "question"];

  it("exist for every advisor and situation, and the two lines differ", () => {
    for (const a of ADVISORS) {
      for (const s of situations) {
        const first = cannedLine(a.id, s, 0), second = cannedLine(a.id, s, 1);
        expect(first.length, `${a.id} ${s}`).toBeGreaterThan(5);
        expect(first, `${a.id} ${s}`).not.toBe(second);
      }
    }
  });

  it("are the same for the same advisor, situation and seed, and cope with odd seeds", () => {
    expect(cannedLine("hale", "react", 41)).toBe(cannedLine("hale", "react", 41));
    expect(cannedLine("hale", "react", -3)).toBe(cannedLine("hale", "react", 3));
    expect(cannedLine("hale", "react", 2.9)).toBe(cannedLine("hale", "react", 2));
  });

  it("claim no facts about the raid: no numbers, no places", () => {
    for (const a of ADVISORS) for (const s of situations) for (const seed of [0, 1]) expect(cannedLine(a.id, s, seed), `${a.id} ${s}`).not.toMatch(/\d/);
  });
});
