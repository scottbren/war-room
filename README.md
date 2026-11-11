# War Room

A prototype of a cinematic covert-raid simulator. The player is the President in the Situation Room: you don't fight the raid, you decide whether it happens, watch it through drone and helmet-cam feeds, and make the calls nobody else can. The prototype targets a single vertical slice (a fortified seaside mansion, codenamed CHARON). The setting and names are fictional.

This is an early prototype built over about a week (first commit 2026-11-02). It is a walkable greybox with a working simulation, not a playable game.

## Status

**Working and tested**
- Deterministic simulation: fixed 10 Hz tick pipeline, seeded PRNG, canonical state hashing, save/restore, and record/replay.
- CHARON map data with a validator, derived walls, a baked navmesh (recast), and line of sight.
- Perception, hearing, camera, combat and wound systems in the sim.
- Browser client: Babylon.js (WebGPU with WebGL2 fallback), the sim running in a Web Worker, click-to-move over the navmesh, camera effects (night vision, thermal, helmet cams).
- Advisor layer built offline: roster, per-advisor knowledge summaries, prompt builder, trigger policy, plan validation and a chat panel.
- A scripted 1200-tick raid replays to identical state hashes in Node, Chromium and Firefox.

**Not built yet**
- No LLM is connected. `packages/gateway` is an empty stub, so advisors answer from canned lines.
- Plan execution: the sim rejects `issuePlan`, `decide` and `intervene` commands ("not implemented until week 2").
- Decision cards (the schema exists, there is no card data), rules of engagement, and the mission/debrief flow.
- Art, audio and animation beyond the greybox.

## Design principles
1. **The simulation is deterministic.** No `Math.random`, wall-clock time or unsorted iteration in `packages/sim`; ESLint enforces the banned APIs.
2. **The sim is pure.** No rendering, DOM or network imports.
3. **Truth vs knowledge.** The UI and any LLM prompt read only what a unit could know, never the simulation's ground truth.
4. **The LLM never blocks the game.** Every call has a timeout and a canned fallback.
5. **Contracts are frozen.** Schemas and public sim types change only deliberately.

## Layout
| Package | Purpose |
| --- | --- |
| `packages/sim` | Deterministic simulation (pure TypeScript; runs in a Web Worker and in Node) |
| `packages/content` | Zod schemas and data files (maps, missions) |
| `packages/agents` | Advisor orchestration: triggers, prompts, plan validation |
| `packages/client` | Babylon.js renderer, React UI, worker bridge |
| `packages/gateway` | Planned LLM proxy (currently empty) |
| `packages/tools` | Headless runner, map validator, navmesh baker, replay tools |

More detail: `docs/technical-design.md` (architecture), `docs/design-spec.md` (game design), `docs/decisions.md` (decision log), `docs/week1-summary.md` (what was built and measured), `CLAUDE.md` (project rules).

## Running it
Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test            # unit and integration tests (vitest)
pnpm dev             # client at http://localhost:5173
pnpm run:headless -- --seeds 100 --ticks 600   # batch headless raids
pnpm validate-map
pnpm smoke           # browser tests; first run: pnpm exec playwright install chromium firefox
```

In the client, press `3` and `4` to hide upper floors, `L` for labels, and click to order the blue unit to walk.

## Tech
TypeScript (strict), pnpm workspaces, Vite, React, zustand, Babylon.js, recast-navigation (WebAssembly), zod, vitest, Playwright, ESLint.

## How it was built
Most of the code was written with an AI coding agent (Claude Code) under a human-written spec: design and technical-design docs, a frozen-contract rule, a task list (`docs/process/TASKS-week1.md`) and agent configs in `.claude/`. The human set the design, made the decisions logged in `docs/decisions.md`, and reviewed the results.
