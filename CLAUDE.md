# War Room

A cinematic covert-raid simulator: the player is the President in the Situation Room, deciding through AI advisors and live feeds. Current target: the CHARON vertical slice.

- New session? Start with `docs/process/AGENT-BOOTSTRAP.md` if the environment isn't set up yet.
- Design spec: `docs/design-spec.md` · Technical design: `docs/technical-design.md` (downloaded copies; claude.ai links are not reachable from here)
- Concrete specs: `docs/contracts-draft.md`, `docs/charon-layout.md`
- Decisions log: `docs/decisions.md` (check before deviating; record approved changes)
- Current tasks: `docs/process/TASKS-week1.md`

## Repo map
- `packages/sim` — deterministic simulation, pure TypeScript, runs in a Web Worker and Node
- `packages/content` — data files and Zod schemas (maps, units, equipment, missions, cards)
- `packages/agents` — advisor orchestration: triggers, prompts, plan validation
- `packages/client` — Babylon.js renderer, React UI, audio, worker bridge
- `packages/gateway` — planned Cloudflare Worker LLM proxy (empty stub for now)
- `packages/tools` — headless runner, greybox generator, map validator, LLM evals

## Commands
- `pnpm typecheck` · `pnpm lint` · `pnpm test`
- `pnpm dev` — client dev server
- `pnpm run:headless -- --seeds 100` — batch raids
- `pnpm validate-map` — check map data

## Golden rules
1. **Contracts are frozen.** Schemas in `content` and public types in `sim` change only with explicit approval.
2. **The simulation is deterministic.** No `Math.random`, wall-clock time, transcendental math, or unsorted iteration in `sim`. Use the seeded PRNG and lookup tables.
3. **`sim` is pure.** No Babylon, React, DOM, or network imports.
4. **Truth vs knowledge.** UI and LLM prompts read only knowledge layers, never simulation truth.
5. **The LLM never blocks the game.** Every LLM call has a timeout and a canned fallback.
6. **Every change ships with tests.** Run the test-runner subagent before calling a task done.
7. **Small tasks.** One task from the task list at a time; clear context between tasks.
8. **Ask before** changing an approved contract, adding a paid service, handling credentials, or deviating from the technical design.
9. **Never game the checks.** No disabling lint rules, skipping tests, or `@ts-ignore` to get green. After two failed attempts at the same problem, stop and report options.

## Working style
- Use the `playwright` MCP server to open the running client (`pnpm dev`), check the console, and take screenshots of the canvas; WebGL content is only visible through screenshots.
- Use subagents: `test-runner` after changes, `determinism-reviewer` for any `sim` diff, `map-validator` after map edits.
- Read the package's own `CLAUDE.md` before working in it.
- Windows dev machine: use pnpm scripts, not shell-specific commands; keep paths cross-platform.
