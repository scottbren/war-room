# agents

Advisor orchestration: deciding when advisors speak, building prompts, routing models, and validating output.

## Hard rules
- Prompts are built only from knowledge layers, never simulation truth.
- Every LLM call has a timeout and a canned fallback line; the game never waits.
- Structured output (plans, recommendations) is validated with Zod; illegal plans are rejected with a reason.
- Player text goes in a delimited, length-capped field.
- Static prompt parts (persona, rules, dossier) are cached; only the knowledge summary and trigger change per call.
- No direct API keys here; all calls go through the gateway.

## Testing
- `pnpm --filter agents test` (uses recorded fixtures, no live calls)
- `pnpm evals` runs live LLM evals on demand only.
