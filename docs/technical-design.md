# War Room — Technical Design

Nov 1, 2026 · @Scott

## Goals and constraints

This document turns the design spec into an implementable architecture for the CHARON vertical slice.

- **Browser first:** WebGPU with automatic WebGL2 fallback. A desktop build comes later through Tauri, from the same code.
- **Zero budget:** free tiers and open-source tools; paid services are optional and metered.
- **One person plus AI coding agents:** strict module contracts, tests agents can run themselves, and short guides agents can read.
- **Deterministic simulation:** the same seed and the same commands produce the same raid on any machine. This powers headless testing, replays, and debugging.
- **The LLM never blocks the game:** every LLM-driven feature has a non-LLM fallback, and the simulation never waits on a response.
- **Minimum spec:** 60 fps on a GTX 1060 at 1080p.

## Stack and repo structure

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | One language for simulation, client, gateway, and tools; agents write it well |
| Build | Vite, pnpm workspaces | Fast dev server, one monorepo |
| Rendering | Babylon.js (WebGPU, WebGL2 fallback) | Full 3D engine with glTF, post-processing, and skeletal animation |
| UI | React with a Zustand store | Panels, cards, and chat fed from simulation snapshots |
| Navigation | recast-navigation-js (WebAssembly) | The same navmesh runs in the browser worker and in Node tests |
| Validation | Zod schemas | One source of truth for data files, plans, and LLM output |
| Gateway | Cloudflare Workers with KV storage | Free tier; holds the API key and logs costs |
| LLM | Anthropic API: a small fast model for reactions, a larger model for plans and briefings | Model names live in config |
| Tests | Vitest; Playwright for smoke tests | The simulation runs headless in Node |
| CI | GitHub Actions | Free tier covers a project this size |
| Desktop (later) | Tauri | Wraps the same build |

```
war-room/
  packages/
    sim/       pure TypeScript simulation, no DOM; runs in a Web Worker and in Node
    content/   data files and Zod schemas: maps, units, equipment, missions, decision cards
    agents/    advisor orchestration: triggers, prompt building, plan validation
    client/    Babylon renderer, React UI, audio, worker bridge
    gateway/   Cloudflare Worker: LLM proxy, rate limits, cost logs
    tools/     headless runner, greybox generator, map validator, LLM eval harness
  docs/        design spec, technical design, per-package agent guides
```

Dependency rules: `sim` depends only on `content`. `agents` depends on `sim` types and `content`. `client` uses everything except `gateway`, which stands alone. `sim` never imports Babylon, React, or browser APIs, so it always runs headless.

## Architecture overview

Three runtimes: the browser main thread (rendering, UI, audio, advisor agents), a simulation Web Worker, and a thin Cloudflare gateway in front of the LLM.

&#91;embedded content: runtime architecture · main thread, worker, gateway\]

- **Player input** becomes commands queued into the simulation worker, stamped with the tick they apply on.
- **The simulation** posts state snapshots at 10 Hz plus typed events. The renderer interpolates between snapshots for smooth 60 fps, and the UI store updates from both.
- **Advisor agents** watch events and player questions, call the LLM through the gateway, validate what comes back, and only then send plans to the simulation as commands.
- **The simulation never waits** on the main thread or the LLM; a slow advisor just answers late.

## Simulation core

- **Fixed tick:** 10 Hz, independent of frame rate.
- **State:** entity-component style, with entities holding components like transform, health, team, perception, AI, and equipment. The whole state serializes at any tick.
- **Inputs and outputs:** a command queue in, snapshots and typed events out.

Each tick runs the systems in a fixed order:

1. Apply queued commands.
2. AI decisions (today: operator behavior between orders, `operatorSystem`; defenders react in step 6b).
3. Movement.
4. Perception, with line of sight staggered across ticks.
5. Smart home: alert-level automation (floodlights, shutters, locks), run once per level and only while a hub is online.
6. Combat.
   - 6b. Defender minds react to everything sensed this tick, including shots just fired (a step added when combat was built; their orders are carried out by movement on the next tick).
7. Suppression and morale.
8. Objectives, complications, and hidden models.
9. Emit events and the snapshot.

**Determinism rules,** enforced by lint rules and tests:

- One seeded random number generator, passed explicitly. No `Math.random`.
- No wall-clock time in gameplay.
- No iteration over unordered collections without sorting first.
- No transcendental math (`sin`, `cos`, `atan2`) in gameplay paths; use lookup tables or integer angles, since these functions can differ between JavaScript engines.
- Positions are quantized when snapshots are taken, so tiny floating-point drift can't accumulate across runs.

**Replay:** a raid is fully described by its seed, content version, and command log. Replaying it reproduces the same state hash every tick, which makes bugs reproducible and powers the future after-action replay.

**Headless:** the same `sim` package runs in Node for tests and batch runs, with no rendering, so agents can run many raids per minute.

## World and map data

One floor-plan data file per mission (`content/maps/charon.json`) is the single source for geometry, navigation, line of sight, and cover. It contains:

- **Floors:** ground, upper, and the compound grounds, each with rooms (polygon, name, tags), walls (segments with thickness and material), and openings like the gallery.
- **Doors and windows:** position and state (open, closed, locked, or blast door), each breachable by specific methods.
- **Vertical links:** stairs and the panic room shaft connecting floors.
- **Cover objects:** footprint, type (heavy, light, or concealment), and facing.
- **Gameplay markers:** spawn points, patrol routes, zones (exposed, garden, marina), and points of interest (the drive, safes, panic room, tunnel).

Everything else is generated from that file:

- **Greybox generator** (`tools/greybox`): builds Babylon meshes from the data (extruded walls, floor slabs, door frames), applies materials by tag, and exports the scene. It re-runs on every data change.
- **Navmesh:** baked per floor with recast from the same geometry, with stairs and the panic shaft as off-mesh links between floors. The baked file loads in the worker and in Node.
- **Line-of-sight grid:** a 2D occupancy grid per floor (0.5 m cells) with cell heights for low cover. Openings like the gallery connect floors for vertical sight. Opening or breaching a door updates the grid, and destroyed walls become rubble cells.
- **Map validator** (`tools/validate-map`): checks that every room is reachable, every door joins two spaces, cover faces somewhere sensible, and the panic room is reachable from both entrances.

## Truth, knowledge, and the intel engine

The core architectural rule: **the simulation holds the truth, and everyone else holds knowledge.**

- **Truth:** where CHARON really is, who's in the house, where every guard stands, whether the drive is with him.
- **Knowledge layers:** the player's picture, each advisor's picture, and the ground force's picture. Each is a filtered copy built from reports and sensors, and it can be stale, partial, or wrong.
- **The UI and every LLM prompt are built only from knowledge, never from truth.** That keeps the fog real and stops advisors from leaking hidden facts.

**Intel phase engine:** a separate deterministic simulation that steps through the 96-hour window in coarse time steps.

- Each source has daily slots, a delivery time, and a report generator that samples the truth through its own noise model: a reliability grade, a chance of false or stale information, and a chance of being detected.
- Hidden alertness rises with detected activity and drives the target's behavioral tells: extra guards, a phone switch, the family sent away, an early flight plan.
- Its output is the starting knowledge state, the target's alertness level, and any changes to the truth (family gone, guards doubled) that carry into the raid.

## AI behavior and the plan schema

- **Guards:** behavior trees per layer (outer ring, veterans, inner circle, reaction force) covering patrol, investigate, alert, defend, escort the principal to the panic room or yacht, and counterattack. Loyalty sets each layer's morale thresholds.
- **Operators:** team-level utility AI that executes plan tasks, plus scripted close-quarters routines (stack, breach, clear a room, hold a corner) with automatic cover selection.
- **Civilians and family:** flee, hide, or freeze, with family-specific behaviors like following him toward the panic room.
- **Enemy AI never uses the LLM.**

**The plan schema** is the contract between the ground force commander's LLM output and the simulation:

```
Plan {
  id, issuedBy, intent
  tasks: [{ team, action, target, conditions?, rules? }]
}
```

- **Actions:** move, clear, hold, breach, overwatch, search (site exploitation), extract, and evacuate a casualty.
- **Targets:** a room id, waypoint, or entity id from the map data.

**Validation** happens in two steps: a Zod shape check, then a legality check against map ids, team capabilities, and your rules of engagement. An illegal plan is rejected with a reason the advisor can explain. The LLM retries once, then the advisor asks you to rephrase.

## Events, decision cards, and hidden models

- **Events** are typed and versioned: contact, casualty, positive ID, family sighted, door breached, alarm, complication triggered, exposure change, and more. Every event is logged for the debrief.
- **Decision cards are content, not code.** Each card in `content` defines its trigger (an event pattern plus conditions), its options and their effects, whether it's reserved or delegable, and the commander's default action. Advisors only add their recommendations on top.
- **Rules of engagement** are checked by the simulation whenever an AI or plan action would cross a line. Crossing a reserved line raises a card instead of acting.
- **Hidden models** are numbers in the simulation that are never shown: the target's alertness, exposure (how public the raid is becoming), and the host government's reaction. Players see them only through behavior, the social media ticker, and advisor comments.
- **Complications** are content-defined. The seeded generator draws 1–2 at mission start, each with its own setup and trigger conditions.

## Advisor agent layer and LLM gateway

Each advisor call is assembled from four parts:

1. **Persona prompt** (static, cached): voice, biases, blind spots, and what this advisor can plausibly know.
2. **Rules and mission dossier** (static, cached).
3. **Knowledge summary** (dynamic, compact): built from that advisor's knowledge layer, never from the truth.
4. **The trigger:** the event, decision card, or player question.

- **Model routing:** the small model handles reactions, card recommendations, and intel summaries; the larger model handles free-text instructions, the briefing, and the debrief.
- **Structured outputs:** recommendations and plans return JSON validated by Zod. Dialogue returns text with a length cap.
- **Never blocking:** every call has a timeout. On a timeout or error, the game plays a canned line for that advisor and situation, and the simulation keeps running.
- **Input safety:** player text goes into a delimited, length-capped field, and the only way it can affect the raid is through a plan that passes validation.
- **Trigger policy:** per-advisor rate limits, importance thresholds for events, and deduplication so advisors don't repeat themselves.
- **Streaming:** dialogue streams into the chat as it arrives, so long answers start appearing quickly.

**Gateway** (Cloudflare Worker):

- Holds the API key; the browser never sees it.
- Endpoints for completions and optional paid text-to-speech.
- Per-session rate limits.
- Logs tokens, cost, and latency for every call, and returns an end-of-session cost summary.
- A bring-your-own-key mode comes later and bypasses the gateway.

## Rendering, views, and audio

- **Worker bridge:** the simulation posts snapshots and events; the main thread interpolates between the last two snapshots for smooth 60 fps.
- **One scene, many cameras.** Situation Room: the main camera plus four helmet cams rendered to low-resolution textures at a reduced frame rate. Drone view: an orbiting camera with sensor post-processing. Tactical view: a free 3D overview.
- **Post-processing:** night-vision phosphor, thermal, grain, fisheye, compression artifacts, and blood decals on the helmet-cam lens.
- **Thermal:** entities and materials carry a heat value, rendered through a replacement material pass, so bodies cool over time on the drone feed.
- **Characters:** glTF skinned meshes, with animation state driven by simulation state (move, crouch, fire, breach, hit, die).
- **Backends:** Babylon's WebGPU engine with automatic WebGL2 fallback; shaders are written to run on both.
- **Audio:** the Web Audio API with positional sound, and a radio filter chain (band-pass, distortion, static) for comms.
- **Voice:** free browser speech synthesis for generated lines, pre-recorded common calls, and optional paid text-to-speech through the gateway.

## Testing and tooling

- **Unit tests** for each simulation system.
- **Scenario tests:** headless raids across many seeds, checking invariants: no stuck units, guards react to alarms, the panic room is reachable, friendly AI never targets the family without a reserved decision, and every mission ends.
- **Determinism tests:** replay a recorded raid and compare state hashes every tick, including a cross-browser check early in development.
- **Balance sweeps:** batch runs that report outcome spreads per approach and loadout, so no single plan always wins.
- **LLM evals:** fixture situations with expected properties (a valid plan, stays in character, no hidden facts leaked), run whenever prompts change.
- **Smoke tests:** Playwright loads the build, starts a raid, and checks for errors on both WebGPU and WebGL2.
- **CI:** unit, scenario, and determinism tests run on every push. LLM evals run on demand to save cost.

## Performance budgets

Targets on the GTX 1060 at 1080p, to verify early and revise with real measurements:

| Area | Target |
| --- | --- |
| Frame rate | 60 fps in the Situation Room and tactical views |
| Simulation tick | Under 5 ms per tick in the worker |
| Line of sight | Spread across ticks; each unit updates a few times per second |
| Helmet cams | Four at low resolution, around 15 fps each |
| Draw calls | Instanced props and merged greybox walls |
| Initial download | Small enough to start quickly, with assets streamed after load |

## Working with AI agents

Claude Code is the only harness to start, with parallelism added in stages.

| Phase | Setup | Why |
| --- | --- | --- |
| Week 1 | One Claude Code session, with subagents for exploration, test runs, and reviews | Contracts and greybox are sequential work; subagents keep noisy work out of the main context |
| Weeks 2–3 | Two or three sessions in separate git worktrees: `sim`, `client` UI, and `agents` | Package boundaries and contracts let tracks run in parallel without file collisions |
| Later, optional | Agent teams | Experimental, off by default, and token-heavy; only if tracks need to coordinate directly |

- **Contracts first:** the schemas in `content` and the public types in `sim` are written and reviewed before parallel work starts. Changing a contract later is a deliberate, reviewed step.
- **Per-package `CLAUDE.md` guides:** each package's purpose, hard rules (for example, no `Math.random` in `sim`), and the commands to run its tests, so every session starts informed.
- **Hooks:** type-checking and unit tests run automatically after edits, so agents catch their own mistakes.
- **Custom subagents:** a test runner, a determinism reviewer (no `Math.random`, no wall-clock time, no unsorted iteration), and a map validator.
- **MCP:** Blender MCP for the asset pass; Playwright MCP from week 1, so agents can open the running game and take screenshots of the canvas; optionally a Babylon.js docs MCP to cut down on invented API calls.
- **Every change ships with tests,** and agents run the headless suite before calling a task done.
- **You review behavior, not code:** watch greybox raids, read test and balance summaries, and play.

**Token budget:** the biggest savings come from how agents are used, not which harness runs them: small focused tasks, clearing context between tasks, subagents for exploration, contracts so agents don't guess, headless tests instead of agents watching runs, and a cheaper model for routine work. A second harness like opencode, routing low-risk work (tests, docs, data files) to cheaper models, is only worth adding if Claude usage limits become a regular blocker. Simulation and architecture-critical code stay on Claude Code.

## Risks and open questions

Each of these gets a small prototype in week 1, before the parallel work starts.

| Risk | Mitigation |
| --- | --- |
| Cross-browser determinism | Lookup tables instead of transcendental math; a cross-browser replay test in week 1 |
| Navmesh in a worker | Confirm recast-navigation-js runs in both a Web Worker and Node |
| Multi-floor line of sight through the gallery and panic shaft | Prototype the vertical openings in the grid early |
| Helmet-cam performance on the 1060 | Lower resolution, or rotate which cams update each frame |
| Thermal rendering approach | Compare a replacement material pass with per-object shaders |
| LLM latency for advisor answers | Streaming, plus instant canned acknowledgments |
| Content growth (cards, complications) | Strict schemas and the map validator from day one |
