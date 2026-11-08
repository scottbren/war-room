import { describe, expect, it } from "vitest";
import { createKnowledge } from "@war-room/sim";
import type { SimEvent } from "@war-room/sim";
import { createAdvisorDesk } from "../src/desk";
import type { Completer } from "../src/complete";
import type { Prompt } from "../src/prompt";
import { HALL, LOBBY, base, map, snap } from "./helpers";

const alpha = { id: "op.alpha.1", side: "operator" as const, at: HALL };
const guard = { id: "def.test.1", side: "defender" as const, at: LOBBY };
const contact = (tick: number): SimEvent => ({ ...base(tick), type: "contact", observer: "op.alpha.1", target: "def.test.1" });
const settle = () => new Promise((r) => setTimeout(r, 20));

function setup(completer?: Completer) {
  const knowledge = createKnowledge(map, "operator");
  const desk = createAdvisorDesk({ map, knowledge, dossier: "dossier", completer, timeoutMs: 100 });
  const step = (tick: number, events: SimEvent[] = []) => {
    knowledge.update(snap(tick, [alpha, guard]), events);
    desk.tick(tick);
  };
  return { desk, step, knowledge };
}

describe("advisor desk", () => {
  it("is offline without a completer, and live with one", () => {
    expect(setup().desk.mode()).toBe("offline");
    expect(setup(async () => "x").desk.mode()).toBe("live");
  });

  it("reacts to a contact: the ground commander and the mission commander speak, in character, with the fact the operators learned", async () => {
    const { desk, step } = setup();
    step(2, [contact(2)]);
    await settle();
    const msgs = desk.messages();
    expect(msgs.map((m) => [m.from, m.kind, m.source])).toEqual([["reyes", "reaction", "canned"], ["hale", "reaction", "canned"]]);
    expect(msgs[0]?.text).toContain("Contact: def.test.1 spotted in Lobby (ground).");
  });

  it("does not repeat itself when the same enemy stays in view", async () => {
    const { desk, step } = setup();
    step(2, [contact(2)]);
    step(5, [contact(5)]);
    step(8, [contact(8)]);
    await settle();
    expect(desk.messages()).toHaveLength(2);
  });

  it("answers a question: the President's words, an instant acknowledgment, then the answer", async () => {
    const { desk, step } = setup();
    step(1);
    desk.ask("kessler", "How sure are we it's him?", 1);
    expect(desk.messages().map((m) => [m.from, m.kind])).toEqual([["president", "question"], ["kessler", "ack"]]); // before any answer
    await settle();
    const all = desk.messages();
    expect(all.map((m) => [m.from, m.kind])).toEqual([["president", "question"], ["kessler", "ack"], ["kessler", "answer"]]);
    expect(all[2]?.source).toBe("canned"); // offline
  });

  it("ignores an empty question", async () => {
    const { desk } = setup();
    desk.ask("hale", "   <>  \n", 0);
    await settle();
    expect(desk.messages()).toEqual([]);
  });

  it("with an LLM attached, uses its words, and gives it a prompt built from knowledge only", async () => {
    const seen: Prompt[] = [];
    const llm: Completer = async (p) => { seen.push(p); return "We have him in the lobby, sir."; };
    // def.test.2 exists in the world but is never seen, so it must not appear in any prompt
    const knowledge = createKnowledge(map, "operator");
    const d2 = createAdvisorDesk({ map, knowledge, dossier: "dossier", completer: llm, timeoutMs: 100 });
    knowledge.update(snap(2, [alpha, guard, { id: "def.test.2", side: "defender", at: { x: 16, y: 15 } }]), [contact(2)]);
    d2.tick(2);
    d2.ask("reyes", "Status?", 2);
    await settle();
    expect(seen.length).toBeGreaterThan(0);
    for (const p of seen) expect(p.user + p.system.join("")).not.toContain("def.test.2");
    expect(d2.messages().some((m) => m.source === "llm" && m.text === "We have him in the lobby, sir.")).toBe(true);
  });

  it("falls back to the canned line when the LLM is too slow, and the desk never throws", async () => {
    const stuck: Completer = () => new Promise(() => {});
    const { desk, step } = setup(stuck);
    step(2, [contact(2)]);
    desk.ask("hale", "Status?", 2);
    await new Promise((r) => setTimeout(r, 250));
    const replies = desk.messages().filter((m) => m.kind === "reaction" || m.kind === "answer");
    expect(replies.length).toBe(3);
    expect(replies.every((m) => m.source === "canned")).toBe(true);
  });

  it("tells a listener about each message as it appears, and keeps only the most recent hundred", async () => {
    const knowledge = createKnowledge(map, "operator");
    const heard: number[] = [];
    const desk = createAdvisorDesk({ map, knowledge, dossier: "d", onMessage: (m) => heard.push(m.id) });
    for (let i = 0; i < 70; i++) desk.ask("hale", `question ${i}`, i);
    await settle();
    expect(heard).toEqual([...heard].sort((a, b) => a - b));
    expect(desk.messages()).toHaveLength(100);
    expect(heard.length).toBe(210);
    expect(desk.messages().at(-1)?.id).toBe(210);
  });
});
