# client

Babylon.js renderer, React UI, audio, and the bridge to the simulation worker.

## Hard rules
- No game logic here: the client renders snapshots and sends commands.
- Babylon WebGPU engine with automatic WebGL2 fallback; shaders must work on both.
- Target 60 fps on a GTX 1060 at 1080p; measure before and after expensive changes.
- UI reads from the Zustand store fed by snapshots, events, and the agents layer.

## Testing
- `pnpm --filter client test`
- `pnpm smoke` runs Playwright on WebGPU and WebGL2.
