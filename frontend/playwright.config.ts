import { defineConfig, devices } from "@playwright/test";

/**
 * Mock-mode Playwright (smoke / critical / a11y / visual + QLT-230 parent).
 * QLT-220: distinct from API-mode — see playwright.api.config.ts + docs/QLT-220-API-E2E-COEVOLUTION.md.
 * API specs under tests/e2e/api are excluded here and run only via test:e2e:api.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Cross-stack API suite is registered only on playwright.api.config.ts.
  testIgnore: ["**/api/**"],
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: process.env.CI ? 2 : 2,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
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
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
