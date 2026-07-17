import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * UI-000 baseline-only config. Host :3100 is occupied by Canbot (not Fersaku).
 * Do not reuse that server. Fersaku mock baseline binds free port 3110.
 */
const port = Number(process.env.PLAYWRIGHT_PORT || 3110);
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: path.join(process.cwd(), "tests/e2e"),
  forbidOnly: false,
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: path.join(process.cwd(), "TASK/evidence/UI-000/artefacts/playwright-report.json") }]],
  outputDir: path.join(process.cwd(), "TASK/evidence/UI-000/artefacts/test-results"),
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    colorScheme: "light",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_DATA_SOURCE: "mock",
      NEXT_TEST_WASM: "1",
    },
  },
});
