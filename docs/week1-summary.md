# Week 1 summary (T0 to T12)

Status on 2026-11-04: every week-1 task is built, tested and committed locally (34 commits, latest T12 = 79872ef). `pnpm typecheck`, `pnpm lint` and `pnpm test` are green (38 test files, 471 tests, plus 4 browser tests under `pnpm smoke`). Nothing has been pushed.

## What was built

| Task | What exists |
|---|---|
| T0 | pnpm monorepo: `sim`, `content`, `agents`, `client`, `gateway`, `tools`; typecheck, lint, vitest workspace. |
| T1 | Contracts frozen: Zod schemas in `content`, public types (`Command`, `Snapshot`, `SimEvent`, `Plan`...) in `sim`. |
| T2 | Determinism primitives: seeded PRNG, trig lookup tables, quantization, canonical hash (FNV-1a). |
| T3 | Simulation skeleton: 10 Hz tick pipeline, `createSim` (enqueue / step / hash / serialize / restore), movement. |
| T4 | Headless runner and record/replay with per-tick hash lists. |
| T5-T6 | CHARON map (now version 12) with derived walls, and the map validator. |
| T7 | Greybox in the browser (Vite + React + Babylon): floors, stairs, labels, floor toggles. |
| T8 | Navmesh: baker (recast), `createNav` (`findPath`, `isWalkable`), vertical links as off-mesh connections. |
| T9 | Line of sight: grid + integer DDA, cover, concealment, doors, shutters, gallery void. Not yet used by the sim pipeline. |
| T10 | Client and worker bridge: sim in a Web Worker at 10 Hz, snapshot interpolation, click-to-move over the navmesh, unit capsules, WebGPU with WebGL2 fallback. |
| T11 | Camera effects (night vision, grain, fisheye, thermal), two thermal approaches, four helmet cams, measured on the GTX 1060. |
| T12 | Cross-browser determinism: the same 1200-tick raid replayed in Chromium and Firefox gives the same hashes as Node. |

Beyond the task list, at Scott's direction: the CHARON map grew through versions 2 to 12 (courtyard villa, modern zigzag, basement, shore, hill, roof, utilities, access control, building services, camera coverage, phones), plus smart-home state in the sim (devices, shutters, alert levels).

## How to run each piece

| Want to | Command / URL |
|---|---|
| Typecheck, lint, tests | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| Walk the greybox | `pnpm dev`, then `http://localhost:5173/` |
| Force the WebGL2 fallback | `http://localhost:5173/?gl=webgl2` |
| Validate the map | `pnpm validate-map` |
| Regenerate derived walls / navmesh | `pnpm derive-walls` · `pnpm bake-navmesh` |
| 100 headless raids | `pnpm run:headless -- --seeds 100 --ticks 600` (writes `out/headless-summary.json`) |
| Navmesh in a worker (T8 check) | `http://localhost:5173/nav-debug.html` |
| Effects and perf measurement (T11) | `http://localhost:5173/perf.html?auto=1` (`&gl=webgl2`, or `&show=nightVision`, `thermalA`, `thermalB`, `helmet1`, `helmetR`...) |
| Replay hash page (T12) | `http://localhost:5173/replay-debug.html` |
| Browser tests (determinism, click-to-move) | `pnpm smoke` (Chromium + Firefox; needs `pnpm exec playwright install chromium firefox` once; takes about a minute) |
| Regenerate the T12 reference run | `pnpm --filter @war-room/tools record-t12` |

### Watching the capsule walk (review item 2)
1. `pnpm dev`, open `http://localhost:5173/`. The overlay shows the backend, fps and tick. A blue capsule stands on the helipad (south of the house, near x 48, y 68).
2. Press `3` and `4` to hide the upper floor and the roof (so a click lands on the ground floor, not on the roof above it).
3. Click inside the panic room: east end of the house, ground floor, about x 66 to 76, y 31 to 41 (label "Panic room"; press `L` for labels). Orbit with the left mouse drag; a click without dragging gives the order.
4. The capsule walks around to the front door, through the foyer and hall, and along the route to the panic room.
Automated checks: `walks from the helipad to the panic room` in `packages/tools/test/nav-sim.test.ts`, and a real mouse click in `packages/client/e2e/click-move.e2e.ts` (`pnpm smoke`). Writing the second one found and fixed two bugs: the click handler threw because of a missing Babylon import, and a click could resolve to a hidden floor that shares a height (hill vs upper). Both are fixed and recorded in `docs/decisions.md`.

## Results
- **Tests:** 471 passing, plus 4 browser tests. 100 headless raids (sandbox map, 600 ticks): 100 distinct final hashes, 3.6 s total. `pnpm validate-map`: no problems on CHARON.
- **Determinism:** replay of a scripted 1200-tick CHARON raid (22 units on real navmesh routes) matches Node tick for tick in Chromium and Firefox 157.
- **Navmesh:** 428 KB, baked in about 2 s; every room reachable from the foyer except the gallery void and the hill villas; doors 1.0 m and wider are passable.
- **Performance (GTX 1060, 1080p, Chromium; `docs/perf-notes.md`):** every effect and all four helmet cams together cost under 4 ms extra per frame on both backends. Helmet cams updated one per frame cost about +1 ms. Greybox only; a lit, detailed scene will cost more.

## Decisions made (full list in `docs/decisions.md`)
- Navmesh settings differ from the design (0.1 m voxels, 0.3 m radius) because 1.0 to 1.2 m doors closed otherwise.
- Floors that share a height (grounds/ground, hill/upper) share one navmesh layer.
- `createSim` stays synchronous; the navmesh is built by the caller and passed in as an option.
- Floor changes along a route pop on arrival at the link end.
- Thermal view: swap materials in place by default (cheapest); a second render pass only when a thermal picture must sit beside the normal view.
- Helmet cams: rotating refresh, one camera per frame.
- Door fail mode is per-door data (table approved by Scott).
- Declined: guard dogs, foyer mantrap.

## Contracts: what changed since the T1 freeze
Approved earlier: floor ids `lower`, `shore`, `hill`; `VerticalLink.restrictedTo` gains `"family"`; smart-home state in the sim (devices, shutters, alert level; commands `setDoor`, `setDevice`, `setShutter`, `setAlert`).

**Needs your confirmation (not yet explicitly approved):** `CreateSimOptions` in `packages/sim/src/types.ts` gained an optional `nav?: Nav` field, so the simulation can be given a navmesh. It is optional, not part of saved state, and changes no schema, command, snapshot or event. Existing callers are unaffected. If you would rather not touch that type, the alternative is a separate `createSimWithNav` function. Also: a move to the unit's own position is rejected as "no route to target" when a navmesh is present.

## Open issues and later work
- Tier-2 utilities runtime spec (`docs/utilities-runtime-spec.md`) is on hold. Open items: generator start delay and battery duration; new command union for cyber actions vs the existing union; whether detection risk is visible to the player.
- Interiors and cover/concealment pass is next after this review (approved by Scott).
- Line of sight is not wired into the sim pipeline (perception system is week 2).
- Floor changes are a pop, not an animated stair walk.
- Safari (WebKit) is not covered by the determinism check.
- WebGPU logs "destroyed texture" warnings on the perf page only (it drives frames by hand).
- Vsynced frame pacing was not measured (the automated browser throttles animation frames). Open `perf.html` in a normal focused Chrome for real fps if wanted.
- Unit capsule colors look washed out (nearly white) in screenshots; cosmetic.
- Roof white-line cosmetic and scenery terrain beyond the walls remain.
- The `generators` dependency still lives in the sim package.json (only tools needs it).

## Review checklist for Scott
1. Walk the greybox (`pnpm dev`) and toggle floors (keys 1 to 7).
2. Watch the capsule path from the helipad to the panic room (steps above).
3. Read this summary and confirm the contracts are frozen, including the one `nav?` option above.
