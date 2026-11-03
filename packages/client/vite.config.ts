import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The map JSON lives in packages/content, outside this package's root.
    fs: { allow: ["../.."] },
  },
});
