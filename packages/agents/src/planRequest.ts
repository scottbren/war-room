import type { Plan } from "@war-room/sim";
import { advisor } from "./advisors";
import { cannedLine } from "./canned";
import { ask } from "./complete";
import type { Completer } from "./complete";
import { ACTIONS, ROE_LEVELS, extractJson, validatePlan } from "./plan";
import type { PlanContext, PlanResult } from "./plan";
import { PLAYER_CLOSE, PLAYER_OPEN, RULES, sanitizePlayerText } from "./prompt";
import type { Prompt } from "./prompt";

/** A plan is longer than a chat reply. */
export const MAX_REPLY_PLAN = 2400;

/** The format section of the plan prompt: static for a map, so it can be cached with the persona. */
function planFormat(ctx: PlanContext): string {
  const rooms = ctx.map.floors.flatMap((f) => f.rooms.filter((r) => !r.tags.includes("void")).map((r) => `${r.id}: ${r.name}`));
  return [
    "Plan format. Reply with ONLY one JSON object, with no other text:",
    '{"id": "plan-1", "issuedBy": "reyes", "intent": "one sentence", "tasks": [{"team": "alpha", "action": "move", "target": {"roomId": "..."}, "rules": ["roe:return"]}]}',
    `Actions: ${ACTIONS.join(", ")}.`,
    "Each task has exactly one target: roomId (a room id from the list below), or at ({floor, x, y} in meters), or entity (a unit id).",
    "move: a room, a point or a unit you have seen. clear, breach, search: a room. hold, extract: a room or a point. overwatch: a room, a point or a unit you have seen. evacuate: one of our downed units.",
    `Optional "rules" per task: ${ROE_LEVELS.map((l) => `"roe:${l}"`).join(", ")} (rules of engagement for that task). Use no other rules.`,
    `At most 12 tasks. Use only the team names and room ids you are given.`,
    `Room ids:\n${rooms.join("\n")}`,
  ].join("\n");
}

/** The prompt that turns the President's instruction into a plan, from the ground commander. */
export function buildPlanPrompt(input: { dossier: string; summary: string; instruction: string; ctx: PlanContext; rejected?: readonly string[] }): Prompt {
  const reyes = advisor("reyes");
  const rejected = input.rejected && input.rejected.length > 0 ? `\n\nYour previous plan was rejected:\n${input.rejected.map((r) => `- ${r}`).join("\n")}\nFix these and reply with only the corrected JSON.` : "";
  return {
    model: "large",
    system: [reyes.persona, `Rules:\n${RULES}\nYou are turning the President's instruction into an order for your teams.`, `Mission dossier:\n${input.dossier}`, planFormat(input.ctx)],
    user: `Situation summary:\n${input.summary}\n\nTeams on the ground: ${input.ctx.teams.join(", ") || "none"}.\n\nThe President instructs you:\n${PLAYER_OPEN}${sanitizePlayerText(input.instruction)}${PLAYER_CLOSE}${rejected}`,
    maxReplyChars: MAX_REPLY_PLAN,
  };
}

export type PlanOutcome =
  /** A legal plan, ready to send to the simulation. `attempts` is how many tries it took (the LLM gets one retry). */
  | { kind: "plan"; plan: Plan; attempts: 1 | 2 }
  /** The LLM answered twice and neither was legal: the commander asks the President to rephrase. */
  | { kind: "rephrase"; reasons: string[]; message: string }
  /** No LLM answer in time (or none attached): the commander says so in a canned line. Nothing is sent. */
  | { kind: "unavailable"; message: string };

/**
 * Turn the President's free-text instruction into a validated plan: ask the commander's LLM, check the reply (JSON, then
 * shape, then legality); if it is not legal, tell the LLM why and ask once more; then ask the President to rephrase.
 * Never throws and never waits past `timeoutMs` per call; only a legal plan is ever returned as a plan.
 */
export async function requestPlan(input: {
  completer: Completer | undefined;
  dossier: string;
  summary: string;
  instruction: string;
  ctx: PlanContext;
  /** Used to pick the canned line. */
  now: number;
  timeoutMs?: number;
}): Promise<PlanOutcome> {
  const unavailable = (): PlanOutcome => ({ kind: "unavailable", message: cannedLine("reyes", "question", input.now) });
  let reasons: string[] = [];
  for (const attempt of [1, 2] as const) {
    const prompt = buildPlanPrompt({ dossier: input.dossier, summary: input.summary, instruction: input.instruction, ctx: input.ctx, rejected: attempt === 2 ? reasons : undefined });
    const reply = await ask(input.completer, prompt, { fallback: "", timeoutMs: input.timeoutMs });
    if (reply.source === "canned") return unavailable();
    const json = extractJson(reply.text);
    const result: PlanResult = json.ok ? validatePlan(json.value, input.ctx) : { ok: false, reasons: [json.reason] };
    if (result.ok) return { kind: "plan", plan: result.plan, attempts: attempt };
    reasons = result.reasons;
  }
  return { kind: "rephrase", reasons, message: `Say again, sir. I couldn't turn that into an order: ${reasons[0] ?? "it was not clear"}. Can you put it another way?` };
}
