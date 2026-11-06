# Combat: proposed spec (first slice)

Status: **proposal, nothing built.** Items marked **[approval]** change a public type or a decision Scott made earlier and need an explicit yes. All numbers are starting values for tuning.

## Goal

Turn "alerted, hold and watch" into a fight that can be won or lost, and give the sim a way to down units, so that bodies, evidence, morale and the debrief become real. The first slice is the smallest fight that is fair, readable and deterministic: units shoot at units they can see, shots hit or miss by range and cover, hits hurt, and health at zero downs a unit.

Not a goal of this slice: wounds and medevac, morale breaks and fleeing, explosives and breaching charges, drones, vehicles, civilians panicking, destroyable cover, ammo and reloads.

## What exists to build on

- `contact` events and `world.sight` already say who can see whom, each check (every 3 ticks), with line of sight, field of view, range and concealment.
- Entities already have `health` (100), `state` (`idle | moving | firing | down`) and `facing`. `down` is already honored by perception, hearing, evidence and movement. Nothing sets it yet.
- The pipeline already has the `combat` and `morale` slots (stubs) after perception.
- Defenders are `alerted` (hold and watch) or `suspicious`; operators have no behavior of their own yet.
- The line-of-sight grid knows low cover (hides a crouched target) and full blocks; map cover rectangles carry `type` (heavy, light, concealment, exposed), `height`, `facing`.

## Rules

### Who fires at whom
- A unit fires only at a unit it can see **right now** (a `contact` in the current sight memory) that is within weapon range and on an opposing side. Operators fire at defenders. Defenders fire at operators. **Nobody fires at family, the principal or civilians** in this slice (their deaths come only from later features: stray fire, strikes).
- Operators: weapons free against defenders they can see (a constant for now; real rules of engagement come with plans, see "Later").
- Defenders: fire when `alerted`, or when an operator is within 10 m and visible (point-blank panic). An unaware defender does not open fire at long range.
- Target choice: the closest visible enemy; ties by id. No target switching more often than every 10 ticks.

### Firing
- One shot every `FIRE_INTERVAL` = 5 ticks (0.5 s) per unit. A unit that fires has `state: "firing"` for that tick and stops moving while it does (movement and firing do not overlap in this slice).
- The hit roll uses one draw from the seeded PRNG per shot, in unit id order.
- **Hit chance** (per mille, integers): base by distance, then modifiers multiply:

| Distance | Base |
| --- | --- |
| up to 10 m | 80% |
| up to 20 m | 55% |
| up to 30 m | 30% |
| up to 40 m | 15% |
| beyond 40 m | no shot |

  - Target in **heavy cover** against the shooter: x 50%. **Light cover**: x 75%. **Exposed** (pool, marina shallows): x 125%. A target counts as covered when a cover rectangle lies within 80 cm of it, on the shooter's side (integer dot product of the shooter-to-target direction with the direction to the rectangle's center is positive). Directional (`facing`) cover is handled as `all` for now.
  - **Moving target**: x 75%. **Firing shooter that is itself suppressed**: x 60% at suppression 50+, x 40% at 80+.
  - **Concealment** (hedge) gives no hit penalty (it only shortens how far the target is seen), as in the design spec.
  - **Darkness**: not yet. It waits for the room light levels in the interiors pass.
- **Damage** per hit: a draw of 15 to 35 (so 3 to 6 hits to down a 100-health unit). Body armor (later, from equipment) subtracts a flat amount.
- **Down**: health 0 or less becomes 0, `state: "down"`, motion cleared. A downed unit stays where it fell and is evidence for defenders (already built). No bleeding out in this slice.

### Suppression (the "suppression and morale" slot, suppression only)
- Each unit has `suppression` 0 to 100. A shot that passes within 2 m of a unit (hit or miss, any side's shooter against it) adds 10, a hit adds 25. It decays by 1 per tick. At 50+ the unit's accuracy drops (above); at 80+ it will not advance (holds, returns fire). It is not saved while 0.
- **Morale breaks and fleeing are not in this slice.** The design says hired guards break under pressure and veterans do not; that needs the loyalty field on units and is the next slice after this one.

### Sound
- A shot is a loud noise: heard out to 60 m (suppressed weapons: 20 m), through walls at half, through floors at a third (same muffling as footsteps). **[approval]** This adds `"shot"` to the `kind` of the existing `noise` event.
- A defender who hears a shot becomes suspicious (existing behavior); one who sees the shooter is alerted (existing behavior).

## Contract changes **[approval]**

1. **Two new `SimEvent` types:**
   - `{ type: "shot"; shooter: EntityId; at: Pos; hit: boolean }`, `at` being where the shot was aimed (the target's position). Truth-level, like `moved`. The knowledge layer shows a shot only if the observing side saw the shooter or heard it.
   - `{ type: "down"; entity: EntityId }`.
2. `noise.kind` becomes `"steps" | "door" | "shot"`.
3. **No change** to `Snapshot`, `Command`, `Plan` or any content schema. Suppression and fire cooldown are internal sim state (like defender minds), saved only while non-zero so quiet runs hash as before. Weapon numbers start as constants in `defaults.ts`. The existing `Equipment` schema (`effects: record of numbers`) can carry weapon stats later without a schema change.

## Decisions I need from you

- **Alert level.** You asked to hold off on alert levels. The first shot is the obvious moment for the house to go to level 2 (shutters drop, lockdown follows). I recommend keeping that **off** in this slice and adding it as its own small step once you want it.
- **Collateral.** Misses that could hit family or civilians: **off** in this slice (I recommend), added with the civilians and family behavior pass so it can be tuned and tracked for the debrief.
- **Friendly fire:** off.

## Build order (each is one small task with tests and the determinism review)

1. **C1: shots, hits, down.** The combat system with a flat hit chance by distance, damage, `shot` and `down` events, the `shot` noise, knowledge showing shots and casualties it sees or hears. Operators and defenders fire as above. Unit and replay tests, a statistics test for the hit rate over many seeded shots, restore mid-firefight.
2. **C2: cover and suppression.** Cover lookup and modifiers, suppression and its effects.
3. **C3: defender combat behavior.** Alerted defenders engage from where they stand, then take the best cover near their post, face known threats, and fall back toward the principal when outnumbered.
4. **C4: operator behavior.** Auto-engage with cover selection; the beginning of rules of engagement.
5. **C5: morale** (loyalty-based breaking and fleeing) and wounded states.

## Later (not in this spec)

Rules of engagement as part of plans (`rules` already exists on tasks), capture kit and less-lethal weapons, breaching and explosives, drone strikes, destroyable cover, darkness and night vision, ammo and reloads, civilian panic and harm tracking, the family following the principal to the panic room.

## How it is tested

- Unit tests per rule (range bands, each modifier, damage range, down).
- Seeded statistics: over 1,000 shots at each distance band the hit rate lands within a few points of the table.
- Replay: the same seed gives the same hashes; a save restored mid-firefight matches an uninterrupted run.
- Headless batch (`pnpm run:headless`) over 100 seeds on the testbed: no crashes, and nobody acts after being downed.
- The determinism reviewer on every sim change; the sim regression pin will move and be re-pinned with a note, as before.
