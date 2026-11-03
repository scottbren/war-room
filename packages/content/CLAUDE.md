# content

Data files and the Zod schemas that define them. This package is the contract layer.

## Hard rules
- Schemas are contracts: changes need approval and a matching migration of existing data.
- Every data file must parse against its schema; tests enforce this.
- Map data lives in `maps/`; run `pnpm validate-map` after any edit.
- Keep decision cards and complications as data, never as code elsewhere.

## Testing
- `pnpm --filter content test`
