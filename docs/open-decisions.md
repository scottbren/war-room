# Open decisions

Things Scott has deferred or that are waiting on an approval. Each item says what is blocked. Move an item to `docs/decisions.md` once it is decided. Last updated 2026-11-06.

## Combat
- **How a surrender shows (C5c).** Option 1 (recommended): a new `SimEvent` `{ type: "surrender"; entity }` plus a `surrendered` flag on what each side knows about a unit; this is a public contract change. Option 2: no contract change, so a surrendered guard just looks like an idle unit that never shoots, and the UI and debrief cannot tell it from a guard standing around. Blocks: surrender and prisoner counting in the debrief. Context: `docs/combat-spec.md`, C5 proposal.
- **Break thresholds for hired guards.** Starting values: suppression 60, badly wounded at health 30 or less, alone under fire (no other alerted defender within 15 m). Wound bands: wounded 31 to 60, badly wounded 30 or less. These are tuning values (`defaults.ts`), to be judged in play.
- **Setting rules of engagement in play.** ROE (`hold`, `return`, `free`) exists but nothing can set it, because `issuePlan` is not implemented (week 2). Proposed: `roe:hold|return|free` strings in a task's `rules`. Needs plan execution, not a contract change.
- **Alert level changes in a fight.** On hold ("hold off on alert levels for now"). Gunfire does not raise the alert level.
- **Collateral and friendly fire.** Off. Collateral belongs with the civilians and family behavior pass.
- **Inner-circle guards.** CHARON has no inner-circle spawn markers (they spawn relative to the principal). The sim already treats `guard:inner-circle` as never breaking.

## Player-facing information
- **Camera feeds for the player.** Needs a new event or a change to `contact` (contract change). Blocks: showing what the security cameras see.
- **Exposing the raid clock to the UI.** Needs approval.

## Map and content
- **Interiors and cover pass on CHARON.** 19 rooms have no furniture and no room light level (bright, dim or dark). Blocks: cover inside the house, darkness in combat.
- **Guard tags on the testbed.** None are added; tests tag a copy of the map in memory.

## On hold by Scott
- Git remote and backup, interior patrols, weather and time effects, the tier-2 utilities runtime spec (3 open items, see `docs/utilities-runtime-spec.md`).
- Declined: guard dogs, a foyer mantrap.

## Before advisor and gateway work
- An Anthropic API daily spend cap needs to be set.
