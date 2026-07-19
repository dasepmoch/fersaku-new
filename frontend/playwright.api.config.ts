import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * QLT-215 / QLT-220 — API-mode Playwright (disposable stack).
 * Distinct from mock projects in playwright.config.ts (which testIgnore api specs).
 * No mock commerce: NEXT_PUBLIC_DATA_SOURCE=api. Traces retain-on-failure only;
 * auth storage under test-results/api/.auth (gitignored; ephemeral cookies).
 * Domain specs co-evolve — see docs/QLT-220-API-E2E-COEVOLUTION.md.
 */
const port = Number(process.env.PLAYWRIGHT_API_PORT || 3120);
const baseURL =
  process.env.PLAYWRIGHT_API_BASE_URL || `http://127.0.0.1:${port}`;
const apiOrigin =
  process.env.API_INTERNAL_URL?.trim() || "http://127.0.0.1:18080";
const skipWebServer = process.env.E2E_API_SKIP_WEBSERVER === "1";
// When webServer is skipped, baseURL may point at Go API only — rewrite probes need Next.
const hasNextEdge =
  process.env.E2E_API_HAS_NEXT === "1" ||
  (!skipWebServer && !process.env.PLAYWRIGHT_API_BASE_URL) ||
  Boolean(process.env.PLAYWRIGHT_API_BASE_URL?.includes(`:${port}`));

export default defineConfig({
  testDir: path.join(process.cwd(), "tests/e2e/api"),
  // Never pull mock smoke/visual/critical into API mode.
  testMatch: "**/*.spec.ts",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  outputDir: path.join(process.cwd(), "test-results/api"),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    // Secret flows: retain only on failure; helpers must mask tokens in annotations.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    colorScheme: "light",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    {
      // QLT-220: single API project — distinct name from mock desktop-chromium.
      name: "api-desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          // Dev server: production `next build` currently fails prerender on /login
          // (useSearchParams suspense) independent of this harness. API mode still
          // exercises same-origin /v1 rewrites + DATA_SOURCE=api against live backend.
          // Prefer turbopack (default next dev); webpack path hits SWC/wasm issues on some hosts.
          command: `npx next dev -p ${port}`,
          url: `${baseURL}/v1/public/products/featured?limit=1`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            NEXT_DIST_DIR: ".next-e2e-api",
            NEXT_PUBLIC_DATA_SOURCE: "api",
            NEXT_PUBLIC_APP_STAGE: "prototype",
            API_INTERNAL_URL: apiOrigin,
            DOMAIN_SOURCE_RELEASE_ID: "qlt-220-api-e2e",
            E2E_API_HAS_NEXT: "1",
          },
        },
      }),
});

// Expose for specs (Node process env).
if (hasNextEdge) {
  process.env.E2E_API_HAS_NEXT = process.env.E2E_API_HAS_NEXT || "1";
} else if (skipWebServer) {
  process.env.E2E_API_HAS_NEXT = process.env.E2E_API_HAS_NEXT || "0";
}
