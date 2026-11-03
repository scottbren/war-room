# tools

Developer tools: headless runner, greybox generator, map validator, LLM eval harness.

## Hard rules
- Tools import from `sim` and `content`, never the reverse.
- Headless runs write JSON summaries to `out/`, not the console only.
- Validator messages name the exact room, door, or object at fault.

## Testing
- `pnpm --filter tools test`
