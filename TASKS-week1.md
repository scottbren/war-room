# Week 1: Contracts and greybox

Goal: lock the contracts, get a deterministic headless simulation running, walk a greybox mansion in the browser, and retire the week-1 technical risks before parallel work starts in week 2.

How to work: one task at a time, in order. Each task lists files to create, what to build, and a **Done when** check. A task is done only when its check passes and the `test-runner` subagent reports green. Commit after each task: `git commit -m "T<n>: <summary>"`. Stop and ask Scott where marked **ASK SCOTT**.

Install the latest stable version of every library unless a version is given. Record exact versions in the lockfile; don't pin by hand.

---

## T0. Repo setup

**Create:**
- `package.json` (root, private), `pnpm-workspace.yaml` (`packages/*`), `.nvmrc` (major version of the installed Node), `.gitignore`, `.editorconfig`, `tsconfig.base.json`, `eslint.config.js`, `vitest.workspace.ts`, `.github/workflows/ci.yml`.
- One `package.json` and `tsconfig.json` per package: `sim`, `content`, `agents`, `client`, `gateway`, `tools`. Package names: `@war-room/<name>`.

**Root `package.json` scripts:**
```json
{
  "typecheck": "pnpm -r run typecheck",
  "lint": "eslint .",
  "test": "vitest run",
  "dev": "pnpm --filter @war-room/client dev",
  "run:headless": "pnpm --filter @war-room/tools run headless",
  "validate-map": "pnpm --filter @war-room/tools run validate-map",
  "derive-walls": "pnpm --filter @war-room/tools run derive-walls",
  "bake-navmesh": "pnpm --filter @war-room/tools run bake-navmesh",
  "smoke": "pnpm --filter @war-room/client run smoke"
}
```
Each package has `"typecheck": "tsc --noEmit"`. Add `"packageManager": "pnpm@<installed version>"` and `"engines": { "node": ">=22" }`.

**`tsconfig.base.json`:** `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `resolveJsonModule: true`, `isolatedModules: true`, `skipLibCheck: true`.

**ESLint (flat config with typescript-eslint):** recommended rules everywhere, plus these for `packages/sim/**`:
- `no-restricted-globals`: `Date`, `performance`, `setTimeout`, `setInterval`.
- `no-restricted-properties`: `Math.random`, `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan`, `Math.atan2`, `Math.asin`, `Math.acos`, `Math.exp`, `Math.log`, `Math.hypot`, each with a message pointing to `sim/src/trig.ts` or `sim/src/rng.ts`.
- `no-restricted-imports`: patterns `@babylonjs/*`, `react`, `react-dom`, `zustand`, `node:*`.

**Dev dependencies (root):** `typescript`, `vitest`, `eslint`, `typescript-eslint`, `@eslint/js`, `prettier`, `tsx`.

**Package dependencies:**
- `content`: `zod`
- `sim`: `@war-room/content` (workspace), `@recast-navigation/core`, `@recast-navigation/generators`
- `tools`: `@war-room/sim`, `@war-room/content`
- `client`: `@war-room/sim`, `@war-room/content`, `@babylonjs/core`, `react`, `react-dom`, `zustand`, `vite`, `@vitejs/plugin-react`; dev: `@playwright/test`
- `agents`, `gateway`: create as empty packages (index.ts exporting nothing) for now.

**CI (`.github/workflows/ci.yml`):** on push and pull request; Ubuntu; setup pnpm via `pnpm/action-setup`, Node from `.nvmrc`, `pnpm install --frozen-lockfile`, then typecheck, lint, test.

**Done when:** `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` all succeed locally (add one trivial test per package so the test run isn't empty). A test file in `sim` that uses `Math.random` makes `pnpm lint` fail (verify, then delete it).

---

## T1. Contracts — ASK SCOTT at the end

**Input:** `docs/contracts-draft.md`. Implement it faithfully; improve names or add fields only where the draft is clearly missing something, and list every change you made.

**Create:**
- `packages/content/src/schemas/{common,map,units,mission,cards}.ts` with Zod schemas and inferred types exported from `packages/content/src/index.ts`.
- `packages/sim/src/types.ts` with `Command`, `Snapshot`, `EntitySnapshot`, `SimEvent`, `Plan`, `Sim`, and the `createSim` signature (implementation comes in T3; export a stub that throws "not implemented").
- `packages/content/test/schemas.test.ts`: one minimal valid example and two invalid examples per schema.

**Done when:** everything compiles and tests pass. Then **ASK SCOTT** to review. Give him a one-page summary: each type, its fields in one line, and every change from the draft. Do not start T2 until he approves. Record approval in `docs/decisions.md`.

---

## T2. Determinism primitives (`packages/sim/src/`)

- `rng.ts`: xoshiro128** with explicit state. API: `createRng(seed: number)`, `rng.nextU32()`, `rng.nextFloat()` in [0,1), `rng.int(min, maxInclusive)`, `rng.pick(array)`, `rng.state()` / `rng.restore(state)`. Seed expansion with splitmix32.
- `trig.ts`: lookup tables for sin and cos at 1-degree resolution (generated at module load from fixed constants, not `Math.sin`; ship the table as literal numbers or compute with a fixed polynomial), `angleBetween(a, b)` returning integer degrees using an integer-only octant method.
- `quantize.ts`: `toCm(m)`, `fromCm(cm)`, `quantizePos(pos)`.
- `hash.ts`: canonical serialization (sorted keys, quantized numbers) plus FNV-1a 32-bit, returned as hex.

**Done when:** tests show (a) the same seed gives the same 10,000-number sequence across two runs, (b) save/restore of RNG state resumes the identical sequence, (c) `angleBetween` is correct for all eight octants and edge cases, (d) hashing the same object with keys in different insertion order gives the same hash.

---

## T3. Simulation skeleton (`packages/sim/src/`)

- `world.ts`: entity store. Entities are records keyed by `EntityId`; components as optional fields (`pos`, `facing`, `health`, `side`, `motion`, `state`). Always iterate entities in sorted id order.
- `pipeline.ts`: the system order from the technical design, as an array of functions `(world, ctx) => void`: commands, ai, movement, perception, combat, morale, objectives, emit. Stubs are fine for ai, perception, combat, morale, objectives.
- `systems/commands.ts`: applies commands whose `tick` equals the current tick; commands for past ticks are rejected with an event.
- `systems/movement.ts`: straight-line movement toward a target at the unit's speed (navmesh comes in T8 and T10).
- `sim.ts`: `createSim({ seed, map })` implementing `enqueue`, `step`, `hash`, `serialize`, and `restore`.
- Spawn: for now, spawn entities from `spawn` markers in the map (T5 provides real ones; use a tiny test map until then).

**Done when:** a test enqueues `move` for one entity, steps until it arrives, and checks positions each tick, the `moved` and `arrived` events, and a stable final hash. A second test serializes mid-run, restores into a new sim, and gets identical hashes for the remaining ticks.

---

## T4. Headless harness and replay (`packages/tools/src/`)

- `headless.ts` (script `headless`): `--seeds N --ticks T --map charon` runs N simulations in Node with scripted random moves drawn from each sim's own RNG. Writes `out/headless-summary.json` with per-seed final hash, ticks run, event counts, and duration.
- `replay.ts`: records `{ seed, mapVersion, commands }` to JSON and replays it, returning the per-tick hash list.
- Test `packages/sim/test/replay.test.ts`: record a 600-tick run, replay it twice, assert identical per-tick hash lists.

**Done when:** `pnpm run:headless -- --seeds 100 --ticks 600` completes, and the replay test passes.

---

## T5. CHARON map data (`packages/content/maps/charon.json`)

**Input:** `docs/charon-layout.md`. Convert every house-relative coordinate to map coordinates (add 32 to x, 16 to y).

1. Author rooms (rectangles), doors, windows, openings, vertical links, cover, zones, and markers by hand from the layout doc. Leave `walls` empty.
2. Build `tools/src/derive-walls.ts` (script `derive-walls`): for each floor, find room boundary edges; shared edges between two rooms become one interior wall; edges with no neighbor become exterior walls. Cut gaps for doors and windows. Apply materials from room tags and the layout doc. Write the walls back into `charon.json` (pretty-printed, stable ordering so diffs are readable).
3. Run it and commit the result.

**Done when:** `charon.json` parses against the schema, and a test confirms the expected room count per floor, that every door sits on a wall line, and that the panic room walls are `reinforced` and not destructible.

---

## T6. Map validator (`packages/tools/src/validate-map.ts`, script `validate-map`)

Checks, each with an error message naming the exact id at fault:
- Every room is reachable from approach A through doors and vertical links, treating locked doors as passable (breachable).
- Every door joins two different rooms (or a room and `outside`) and sits on a wall.
- No rooms overlap on the same floor (touching edges are fine).
- Cover facing is set unless `"all"`.
- The panic room is reachable from both the ground-floor hall door and the upper-floor shaft.
- The tunnel link exits at the boathouse.
- Every `family`-tagged room exists on the upper floor.

**Done when:** `charon.json` passes, and three deliberately broken fixture maps in `packages/tools/test/fixtures/` each fail with the expected message.

---

## T7. Greybox in the client (`packages/client/src/greybox/`)

Decision already made: greybox meshes are built at runtime from map data (see `docs/decisions.md`).

- `build.ts`: `buildGreybox(scene, map)` creates floor slabs per room (at floor elevation), extruded walls (thin boxes along each wall segment, with height), door frames as gaps, cover blocks (colored by type: heavy blue-grey, light amber, concealment green, semi-transparent), zone overlays on the grounds (pool and sea as flat translucent planes), and the roof parapet.
- Map (x, y, z) → Babylon (x, z, y).
- Merge static wall meshes per floor and material to keep draw calls low.
- A floor visibility toggle (keys 1–4: grounds, ground, upper, roof) so interiors can be inspected.
- Minimal client app: Vite + React shell with a full-screen canvas.

**Done when:** `pnpm dev` shows all levels of the estate; toggling floors works; editing a room in `charon.json` and reloading changes the scene.

---

## T8. Risk prototype: navmesh

- `tools/src/bake-navmesh.ts` (script `bake-navmesh`): builds triangle geometry for all floors (floor slabs at their elevations, wall boxes as obstacles), generates one navmesh with `@recast-navigation/generators` (agent radius 0.35 m, height 1.8 m, max climb 0.4 m, cell size 0.2 m, cell height 0.2 m), adds the vertical links as off-mesh connections, and exports the binary to `packages/content/generated/charon.navmesh.bin`.
- `sim/src/nav.ts`: loads the binary (`importNavMesh`), exposes `findPath(from: Pos, to: Pos): Pos[]`.
- Note: recast requires an async `init()` before use; `createSim` becomes async or takes a pre-initialized nav object. Choose one and record it in `docs/decisions.md`.

**Done when:** tests in Node find paths (a) foyer → study, (b) foyer → son's room via the stairs, (c) master suite → panic room, (d) panic room → boathouse via the tunnel, and (e) the same queries succeed inside a Web Worker in the client (a debug page or Playwright test is fine). If recast can't run in the worker, stop and report options.

---

## T9. Risk prototype: line of sight (`packages/sim/src/los.ts`)

- Per-floor grid at 0.5 m cells built from map data. Cell values: `0` open, `1` low cover (blocks a crouched target, not a standing one), `2` full block (walls, closed doors, tall cover). Concealment is a separate flag that reduces detection range.
- Ray tracing with an integer DDA (Amanatides–Woo using fixed-point integers, no floating-point division in the loop).
- Doors update their cells when opened, closed, or breached.
- Vertical sight: an observer on `upper` inside `u.gallery` can see cells on `ground` inside the area under `u.void`, and vice versa, with the 2D ray traced on the ground floor from the observer's projected position.

**Done when:** tests cover: sight through an open door and blocked by a closed one; blocked around a corner; a crouched target behind a planter hidden while a standing one is visible; gallery-to-great-room sight both ways; and concealment reducing detection range.

---

## T10. Client and worker bridge (`packages/client/src/`)

- Engine creation: if `WebGPUEngine.IsSupportedAsync` resolves true, create `WebGPUEngine` and `await engine.initAsync()`; otherwise create a WebGL2 `Engine`. A `?gl=webgl2` URL parameter forces the fallback for testing.
- `sim.worker.ts`: runs the sim at 10 Hz (using `setInterval` is fine here; the client is not the sim), posts snapshots and events, receives commands.
- `bridge.ts`: keeps the last two snapshots and interpolates positions for each rendered frame.
- Camera: ArcRotateCamera over the estate with RTS-style limits (pan, zoom, clamp pitch).
- Units: capsules colored by side. Clicking the ground issues a `move` command for the selected operator; the sim follows the navmesh path from T8.
- Show the active backend (WebGPU or WebGL2) and FPS in a corner overlay.

**Done when:** an operator capsule walks from the helipad to the study via the foyer and hall, on both backends.

---

## T11. Risk prototype: camera effects and performance

- Post-process effects (Babylon `PostProcess` with custom shaders that compile on both backends): night-vision phosphor (green, bloom, noise), grain, fisheye, and a thermal view.
- Thermal: implement two approaches and compare: (a) a replacement material pass where each mesh carries a `heat` value (0–1) and renders in grayscale white-hot, (b) per-object shader swap. Pick one, record why in `docs/decisions.md`.
- Four helmet cams: `RenderTargetTexture` at 320×180 each, attached to operator capsules, shown in a 2×2 overlay. Try `refreshRate` 2 (every other frame) and rotating updates.

**Done when:** `docs/perf-notes.md` contains measured frame times on Scott's GTX 1060 at 1080p for: plain scene, with each effect, with four helmet cams, on WebGPU and WebGL2. **ASK SCOTT** to run the measurement page and paste the numbers if you can't run the browser yourself.

---

## T12. Risk prototype: cross-browser determinism

- A debug page in the client that runs a recorded replay inside the worker and prints the per-tick hash list.
- A Playwright test that loads the page in Chromium and Firefox, collects both hash lists, and compares them to the Node result from T4.
- Install browsers first: `pnpm exec playwright install chromium firefox`.

**Done when:** all three hash lists match. If they don't, find the first diverging tick, fix the cause (usually a transcendental function or float accumulation), and re-run.

---

## T13. Week-1 review — ASK SCOTT

Prepare `docs/week1-summary.md`: what was built, how to run each piece (exact commands and URLs), test and headless results, perf numbers, decisions made, and open issues. Then ask Scott to:
1. Walk the greybox (`pnpm dev`) and toggle floors.
2. Watch a capsule path from the helipad to the panic room.
3. Read the summary and confirm the contracts are frozen.

**Week 2 starts only after Scott confirms.**
