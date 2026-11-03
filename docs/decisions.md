# Decisions log

Record every decision that changes or clarifies the technical design. Newest first.

Format: `YYYY-MM-DD — Decision — Why — Approved by`

- 2026-11-02 — Greybox meshes are built at runtime in the client from map data (not exported by a tool) — simpler, and edits to the JSON appear on reload — Scott (starter kit)
- 2026-11-02 — One navmesh covers all floors (recast handles stacked levels); stairs and the panic shaft are off-mesh connections — simpler than per-floor meshes with links — Scott (starter kit)
- 2026-11-02 — `sim` may depend on the recast-navigation WebAssembly packages (no DOM, deterministic for identical input) — needed for pathfinding in the worker and Node — Scott (starter kit)
- 2026-11-02 — Walls are derived from room rectangles by a tool, then committed into the map JSON — hand-authoring every wall is error-prone — Scott (starter kit)
