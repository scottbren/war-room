import { z } from "zod";
import { FloorId } from "@war-room/content";
import type { MapFile } from "@war-room/content";
import type { Knowledge, Plan } from "@war-room/sim";

/**
 * Validating a plan the ground commander's LLM wrote (technical design, "The plan schema"): first the shape (Zod), then
 * legality against the map, the teams on the ground, what the player actually knows, and the rules of engagement the
 * player set. An illegal plan comes back with plain reasons the advisor can explain; nothing illegal ever reaches the
 * simulation. Pure: no LLM, no clock.
 */

export const ACTIONS = ["move", "clear", "hold", "breach", "overwatch", "search", "extract", "evacuate"] as const;
export type Action = (typeof ACTIONS)[number];

/** Rules of engagement, loosest last. A task may carry `roe:<level>` in its `rules`. */
export const ROE_LEVELS = ["hold", "return", "free"] as const;
export type Roe = (typeof ROE_LEVELS)[number];

/** What a task may point at, per action. `known` means a unit the operators have actually seen. */
const TARGETS: Record<Action, { room: boolean; at: boolean; known: boolean; downedOwn: boolean }> = {
  move: { room: true, at: true, known: true, downedOwn: false },
  clear: { room: true, at: false, known: false, downedOwn: false },
  hold: { room: true, at: true, known: false, downedOwn: false },
  breach: { room: true, at: false, known: false, downedOwn: false },
  overwatch: { room: true, at: true, known: true, downedOwn: false },
  search: { room: true, at: false, known: false, downedOwn: false },
  extract: { room: true, at: true, known: false, downedOwn: false },
  evacuate: { room: false, at: false, known: false, downedOwn: true },
};

const MAX_TASKS = 12;
const MAX_TEXT = 80;

const Place = z.object({ floor: FloorId, x: z.number().finite(), y: z.number().finite() }).strict();
const Target = z
  .object({ roomId: z.string().min(1).max(MAX_TEXT).optional(), at: Place.optional(), entity: z.string().min(1).max(MAX_TEXT).optional() })
  .strict()
  .refine((t) => [t.roomId, t.at, t.entity].filter((v) => v !== undefined).length === 1, { message: "give exactly one of roomId, at or entity" });
const Task = z
  .object({
    team: z.string().min(1).max(MAX_TEXT),
    action: z.enum(ACTIONS),
    target: Target,
    conditions: z.array(z.string().min(1).max(MAX_TEXT)).max(4).optional(),
    rules: z.array(z.string().min(1).max(MAX_TEXT)).max(4).optional(),
  })
  .strict();
export const PlanShape = z
  .object({
    id: z.string().min(1).max(MAX_TEXT),
    issuedBy: z.string().min(1).max(MAX_TEXT),
    intent: z.string().min(1).max(300),
    tasks: z.array(Task).min(1).max(MAX_TASKS),
  })
  .strict();

/** Everything legality is checked against. */
export interface PlanContext {
  map: MapFile;
  /** Teams on the ground ("alpha" for op.alpha.1). */
  teams: readonly string[];
  /** Every unit the operators know about (own units included). */
  knownEntities: ReadonlySet<string>;
  /** Our units known to be down: the only ones `evacuate` may name. */
  downedOwn: ReadonlySet<string>;
  /** The loosest rules of engagement the player allows. */
  maxRoe: Roe;
}

/** Build the context from the operators' knowledge (never truth) and the map. */
export function planContext(map: MapFile, knowledge: Knowledge, maxRoe: Roe = "free"): PlanContext {
  const units = knowledge.units();
  const teams = [...new Set(units.filter((u) => u.own).map((u) => u.id.split(".")[1]).filter((t): t is string => t !== undefined && t !== ""))].sort();
  return {
    map,
    teams,
    knownEntities: new Set(units.map((u) => u.id)),
    downedOwn: new Set(units.filter((u) => u.own && u.down).map((u) => u.id)),
    maxRoe,
  };
}

export type PlanResult = { ok: true; plan: Plan } | { ok: false; reasons: string[] };

const MAX_REASONS = 5;

/** Check a plan: shape first, then legality. Never throws; every reason names the task at fault. */
export function validatePlan(raw: unknown, ctx: PlanContext): PlanResult {
  const parsed = PlanShape.safeParse(raw);
  if (!parsed.success) {
    const reasons = parsed.error.issues.slice(0, MAX_REASONS).map((i) => `${i.path.length > 0 ? i.path.join(".") : "plan"}: ${i.message}`);
    return { ok: false, reasons };
  }
  const plan = parsed.data;
  const reasons: string[] = [];
  const rooms = new Map(ctx.map.floors.flatMap((f) => f.rooms.map((r) => [r.id, r] as const)));
  const floors = new Set(ctx.map.floors.map((f) => f.id));
  const { min, max } = ctx.map.bounds;

  plan.tasks.forEach((t, i) => {
    const label = `task ${i + 1} (${t.team} ${t.action})`;
    const allowed = TARGETS[t.action];
    if (!ctx.teams.includes(t.team)) reasons.push(`${label}: no team called "${t.team}" (teams: ${ctx.teams.join(", ") || "none"})`);

    const { roomId, at, entity } = t.target;
    if (roomId !== undefined) {
      const room = rooms.get(roomId);
      if (!allowed.room) reasons.push(`${label}: ${t.action} cannot target a room`);
      else if (!room) reasons.push(`${label}: room "${roomId}" does not exist`);
      else if (room.tags.includes("void")) reasons.push(`${label}: "${roomId}" is an open void, not a place a team can go`);
    } else if (at !== undefined) {
      if (!allowed.at) reasons.push(`${label}: ${t.action} cannot target a point; name a room`);
      else if (!floors.has(at.floor)) reasons.push(`${label}: this map has no floor "${at.floor}"`);
      else if (at.x < min.x || at.x > max.x || at.y < min.y || at.y > max.y) reasons.push(`${label}: that point is off the map`);
    } else if (entity !== undefined) {
      if (allowed.downedOwn) {
        if (!ctx.downedOwn.has(entity)) reasons.push(`${label}: "${entity}" is not one of our downed units`);
      } else if (allowed.known) {
        if (!ctx.knownEntities.has(entity)) reasons.push(`${label}: nobody has seen "${entity}", so it cannot be a target`);
      } else reasons.push(`${label}: ${t.action} cannot target a unit`);
    }

    for (const rule of t.rules ?? []) {
      const level = /^roe:(.+)$/.exec(rule)?.[1];
      if (level === undefined || !(ROE_LEVELS as readonly string[]).includes(level)) {
        reasons.push(`${label}: unknown rule "${rule}" (known: ${ROE_LEVELS.map((l) => `roe:${l}`).join(", ")})`);
      } else if (ROE_LEVELS.indexOf(level as Roe) > ROE_LEVELS.indexOf(ctx.maxRoe)) {
        reasons.push(`${label}: roe:${level} is looser than the rules of engagement you set (at most roe:${ctx.maxRoe})`);
      }
    }
  });
  if (reasons.length > 0) return { ok: false, reasons: reasons.slice(0, MAX_REASONS) };
  return { ok: true, plan: plan as Plan };
}

/**
 * Pull a JSON object out of an LLM reply, which may wrap it in a code fence or add a sentence around it. Returns the
 * parsed value, or why it could not be read.
 */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const unfenced = text.replace(/```(?:json)?/gi, " ");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, reason: "the reply contains no JSON object" };
  try {
    return { ok: true, value: JSON.parse(unfenced.slice(start, end + 1)) as unknown };
  } catch {
    return { ok: false, reason: "the reply is not valid JSON" };
  }
}
