# gateway

Cloudflare Worker that proxies LLM and text-to-speech calls.

## Hard rules
- The API key lives only in Worker secrets, never in client code or the repo.
- Enforce per-session rate limits and input size caps.
- Log tokens, cost, and latency per call.
- Stay on the free tier: no paid Cloudflare features without approval.

## Testing
- `pnpm --filter gateway test`
