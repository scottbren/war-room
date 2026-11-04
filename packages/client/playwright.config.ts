import { defineConfig } from "@playwright/test";

/** Browser tests (`pnpm smoke`): determinism of the sim inside real browsers. They need a running dev server, started here. */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts", // not *.spec.ts: vitest would try to run those
  timeout: 90_000,
  use: { baseURL: "http://localhost:5199" },
  webServer: { command: "pnpm exec vite --port 5199 --strictPort", url: "http://localhost:5199", reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
});
