import type { Prompt } from "./prompt";

/**
 * One LLM call. The real one (a request to the gateway) comes later; tests and offline play use a stand-in. It must stop
 * when `signal` aborts. It may throw or reject; the caller copes.
 */
export type Completer = (prompt: Prompt, signal: AbortSignal) => Promise<string>;

export interface Reply {
  text: string;
  /** "llm" if the model answered in time, "canned" if the fallback line was used. */
  source: "llm" | "canned";
  /** Why the fallback was used. */
  reason?: "unavailable" | "timeout" | "error" | "empty";
}

/** How long a call may take before the canned line is used (ms). */
export const DEFAULT_TIMEOUT_MS = 8000;

/** Trim a reply to a length cap, at a word boundary where there is one, marking the cut. */
export function clampReply(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Ask an advisor. Never throws and never waits longer than `timeoutMs`: a slow, failing, empty or missing completer
 * all give the canned `fallback` line, so the game is never blocked on an LLM.
 */
export async function ask(completer: Completer | undefined, prompt: Prompt, options: { fallback: string; timeoutMs?: number }): Promise<Reply> {
  const canned = (reason: NonNullable<Reply["reason"]>): Reply => ({ text: options.fallback, source: "canned", reason });
  if (!completer) return canned("unavailable");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  try {
    // A call that fails after we gave up must not become an unhandled rejection.
    const call = Promise.resolve()
      .then(() => completer(prompt, controller.signal))
      .catch(() => "error" as const);
    const result = await Promise.race([call, timeout]);
    if (result === "timeout") return canned("timeout");
    if (result === "error") return canned("error");
    const text = clampReply(result, prompt.maxReplyChars);
    return text === "" ? canned("empty") : { text, source: "llm" };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
