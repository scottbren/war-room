import type { MapFile } from "@war-room/content";
import type { Knowledge } from "@war-room/sim";
import { advisor } from "./advisors";
import type { AdvisorId } from "./advisors";
import { cannedLine } from "./canned";
import { ask } from "./complete";
import type { Completer } from "./complete";
import { DEFAULT_POLICY, createPolicy } from "./policy";
import type { PolicyConfig } from "./policy";
import { buildPrompt, sanitizePlayerText } from "./prompt";
import { summarizeKnowledge } from "./summary";
import { createWatcher } from "./watch";

export interface Message {
  /** Increases in the order messages appear. */
  id: number;
  tick: number;
  from: AdvisorId | "president";
  /** `question` is the President's; `ack` is the instant acknowledgment; `reaction` and `answer` are the advisor's reply. */
  kind: "question" | "ack" | "reaction" | "answer";
  text: string;
  /** For an advisor's reply: the model's own words, or a canned line. */
  source?: "llm" | "canned";
}

export interface DeskOptions {
  map: MapFile;
  /** The operators' knowledge: the only picture advisors get. */
  knowledge: Knowledge;
  /** Static mission briefing text for the prompts. */
  dossier: string;
  /** The LLM call. Without one the desk runs offline and every reply is a canned line. */
  completer?: Completer;
  policy?: PolicyConfig;
  timeoutMs?: number;
  onMessage?(message: Message): void;
}

/** Most messages kept. */
const MAX_MESSAGES = 100;

/**
 * The advisors as the player meets them: they react to what the operators learn (within the trigger policy) and answer
 * questions. It never blocks: every reply comes from `ask`, which falls back to a canned line.
 */
export function createAdvisorDesk(options: DeskOptions) {
  const { map, knowledge, dossier, completer } = options;
  const watcher = createWatcher(map, knowledge);
  const policy = createPolicy(options.policy ?? DEFAULT_POLICY);
  const log: Message[] = [];
  let nextId = 1;

  const push = (m: Omit<Message, "id">): void => {
    const message: Message = { ...m, id: nextId++ };
    log.push(message);
    if (log.length > MAX_MESSAGES) log.shift();
    options.onMessage?.(message);
  };

  return {
    /** "live" when an LLM is attached, "offline" when every reply is canned. */
    mode: (): "live" | "offline" => (completer ? "live" : "offline"),

    /** Call once per tick, in order: advisors react to anything new in the operators' knowledge. */
    tick(now: number): void {
      for (const h of watcher.poll(now)) {
        for (const id of policy.offer(h, now)) {
          const prompt = buildPrompt({ advisor: advisor(id), dossier, summary: summarizeKnowledge(map, knowledge, now), trigger: { kind: "event", description: h.description } });
          // Offline, the reaction is the fact the operators learned, then the advisor's stock line.
          const fallback = `${h.description} ${cannedLine(id, "react", now)}`;
          void ask(completer, prompt, { fallback, timeoutMs: options.timeoutMs }).then((reply) => push({ tick: now, from: id, kind: "reaction", text: reply.text, source: reply.source }));
        }
      }
    },

    /** The President asks an advisor something: the question is logged, a canned acknowledgment shows at once, the answer follows. */
    ask(id: AdvisorId, text: string, now: number): void {
      const question = sanitizePlayerText(text);
      if (question === "") return;
      push({ tick: now, from: "president", kind: "question", text: question });
      push({ tick: now, from: id, kind: "ack", text: cannedLine(id, "ack", now), source: "canned" });
      const prompt = buildPrompt({ advisor: advisor(id), dossier, summary: summarizeKnowledge(map, knowledge, now), trigger: { kind: "question", text: question } });
      void ask(completer, prompt, { fallback: cannedLine(id, "question", now), timeoutMs: options.timeoutMs }).then((reply) =>
        push({ tick: now, from: id, kind: "answer", text: reply.text, source: reply.source }),
      );
    },

    messages: (): readonly Message[] => log.slice(),
  };
}

export type AdvisorDesk = ReturnType<typeof createAdvisorDesk>;
