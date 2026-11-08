import { describe, expect, it } from "vitest";
import { ask, clampReply } from "../src/complete";
import type { Completer } from "../src/complete";
import type { Prompt } from "../src/prompt";

const prompt: Prompt = { model: "small", system: ["persona"], user: "summary", maxReplyChars: 100 };
const fallback = "Stand by, Mr. President.";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ask", () => {
  it("returns the model's answer when it arrives in time", async () => {
    const reply = await ask(async () => "  The force has the foyer.  ", prompt, { fallback, timeoutMs: 200 });
    expect(reply).toEqual({ text: "The force has the foyer.", source: "llm" });
  });

  it("gives the canned line when there is no completer at all", async () => {
    expect(await ask(undefined, prompt, { fallback })).toEqual({ text: fallback, source: "canned", reason: "unavailable" });
  });

  it("gives the canned line on time, however slow or stuck the call is (the game never waits)", async () => {
    const stuck: Completer = () => new Promise(() => {}); // never settles, ignores the signal
    const started = Date.now();
    const reply = await ask(stuck, prompt, { fallback, timeoutMs: 30 });
    expect(reply).toEqual({ text: fallback, source: "canned", reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("aborts the call it gave up on", async () => {
    let aborted = false;
    const slow: Completer = (_p, signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => { aborted = true; });
      setTimeout(() => resolve("too late"), 500);
    });
    const reply = await ask(slow, prompt, { fallback, timeoutMs: 20 });
    expect(reply.reason).toBe("timeout");
    expect(aborted).toBe(true);
  });

  it("gives the canned line when the call rejects or throws, and a late failure is not an unhandled rejection", async () => {
    expect((await ask(() => Promise.reject(new Error("503")), prompt, { fallback })).reason).toBe("error");
    expect((await ask(() => { throw new Error("sync"); }, prompt, { fallback })).reason).toBe("error");
    const late: Completer = async () => { await sleep(60); throw new Error("late"); };
    expect((await ask(late, prompt, { fallback, timeoutMs: 10 })).reason).toBe("timeout");
    await sleep(120); // a rejection nobody handled would fail the test run here
  });

  it("gives the canned line for an empty or blank answer", async () => {
    expect((await ask(async () => "", prompt, { fallback })).reason).toBe("empty");
    expect((await ask(async () => "   \n ", prompt, { fallback })).reason).toBe("empty");
  });

  it("cuts a long answer to the prompt's cap", async () => {
    const reply = await ask(async () => "word ".repeat(200), prompt, { fallback });
    expect(reply.source).toBe("llm");
    expect(reply.text.length).toBeLessThanOrEqual(prompt.maxReplyChars);
    expect(reply.text.endsWith("…")).toBe(true);
  });
});

describe("clampReply", () => {
  it("leaves a short reply alone, tidying whitespace", () => {
    expect(clampReply("a  b\nc", 50)).toBe("a b c");
  });
  it("cuts at a word boundary when there is one, and hard when there is not", () => {
    expect(clampReply("alpha bravo charlie delta", 18)).toBe("alpha bravo…");
    expect(clampReply("x".repeat(40), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
