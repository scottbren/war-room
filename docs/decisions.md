# Decisions log

Record every decision that changes or clarifies the technical design. Newest first.

Format: `YYYY-MM-DD — Decision — Why — Approved by`

- 2026-11-02 — TypeScript pinned to ~6.0 instead of latest 7.x — typescript-eslint 8.72 refuses to load on TS 7 (peer range <6.1), which breaks `pnpm lint`; revisit when typescript-eslint supports 7 — pending Scott (T0 tooling constraint)
- 2026-11-02 — pnpm 12.16.1 (latest) is the project package manager; esbuild build script allowed via `allowBuilds` in pnpm-workspace.yaml (pnpm 12 blocks build scripts by default) — Scott (pnpm update); esbuild allowance pending Scott

- 2026-11-02 — Greybox meshes are built at runtime in the client from map data (not exported by a tool) — simpler, and edits to the JSON appear on reload — Scott (starter kit)
- 2026-11-02 — One navmesh covers all floors (recast handles stacked levels); stairs and the panic shaft are off-mesh connections — simpler than per-floor meshes with links — Scott (starter kit)
- 2026-11-02 — `sim` may depend on the recast-navigation WebAssembly packages (no DOM, deterministic for identical input) — needed for pathfinding in the worker and Node — Scott (starter kit)
- 2026-11-02 — Walls are derived from room rectangles by a tool, then committed into the map JSON — hand-authoring every wall is error-prone — Scott (starter kit)
