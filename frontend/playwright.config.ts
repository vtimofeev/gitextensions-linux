import { existsSync } from "node:fs";
import { chromium, defineConfig } from "@playwright/test";
// Reuse an installed browser when the matching Playwright bundle is absent.
const browserPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  [
    chromium.executablePath(),
    "/opt/google/chrome/chrome",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find((path) => existsSync(path));
export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 960 },
    launchOptions: browserPath ? { executablePath: browserPath } : {},
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
