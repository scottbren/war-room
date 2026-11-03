# sim

Deterministic raid simulation. Runs in a Web Worker in the browser and in Node for tests.

## Hard rules
- No `Math.random`, `Date`, `performance.now`, or `Math.sin/cos/tan/atan2`. Use `rng.ts` and the trig lookup tables.
- No imports from Babylon, React, the DOM, or the network.
- Never iterate a Map, Set, or object keys without sorting first.
- All randomness flows from the seeded PRNG passed in explicitly.
- Fixed 10 Hz tick; systems run in the order defined in `pipeline.ts`.
- Public types (`Command`, `Snapshot`, `SimEvent`, `Plan`) are contracts: don't change them without approval.

## Testing
- `pnpm --filter sim test`
- Any behavior change needs a unit test, and anything touching the tick needs a replay hash test.
- Ask the `determinism-reviewer` subagent to review every diff here.
