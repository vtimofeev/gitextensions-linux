import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Performance probes (tests/perf).
export default defineConfig({
  ...base,
  testDir: "./tests/perf",
  testMatch: /.*\.perf\.ts/,
  workers: 1,
  reporter: "line",
  // WebKit downloads may be unavailable; CPU throttling (PERF_CPU_THROTTLE, e.g. 4)
  // approximates slower machines and the WebKitGTK runtime in Chromium.
  projects: [
    {
      name: "chromium",
      use: { ...base.use, baseURL: "http://127.0.0.1:5174" },
    },
  ],
  // Measure the production bundle (what Wails embeds), not the Vite dev server.
  webServer: {
    command:
      "npx vite build --logLevel error && npx vite preview --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
