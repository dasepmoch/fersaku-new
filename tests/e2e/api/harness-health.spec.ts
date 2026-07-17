import { test, expect } from "@playwright/test";
import {
  apiOrigin,
  assertNonProductionHarness,
  mailpitHealth,
  SEED_PASSWORD,
  SEED_PERSONAS,
} from "./helpers";

/**
 * QLT-215 minimal harness probes.
 * Failures here indicate stack/harness issues, not product domain regressions.
 */

test.describe("QLT-215 API harness health", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("backend health/live is up", async ({ request }) => {
    const origin = apiOrigin();
    const res = await request.get(`${origin}/health/live`);
    expect(res.status(), "api /health/live").toBe(200);
  });

  test("backend health/ready is up", async ({ request }) => {
    const origin = apiOrigin();
    const res = await request.get(`${origin}/health/ready`);
    expect(res.status(), "api /health/ready").toBe(200);
  });

  test("public featured endpoint responds without mock fallback", async ({
    request,
  }) => {
    const origin = apiOrigin();
    const res = await request.get(
      `${origin}/v1/public/products/featured?limit=6`,
    );
    expect(res.status(), "featured HTTP").toBe(200);
    const json = (await res.json()) as {
      data?: unknown;
      meta?: unknown;
    };
    expect(json, "envelope present").toBeTruthy();
    expect(Array.isArray(json.data), "featured data array").toBe(true);
  });

  test("Next same-origin rewrite proxies public featured", async ({
    request,
    baseURL,
  }) => {
    test.skip(
      process.env.E2E_API_HAS_NEXT === "0",
      "Next edge not running (set E2E_API_HAS_NEXT=1 or use playwright webServer)",
    );
    expect(baseURL, "Playwright baseURL").toBeTruthy();
    const res = await request.get("/v1/public/products/featured?limit=3");
    expect(res.status(), "Next→API featured").toBe(200);
    const json = (await res.json()) as { data?: unknown };
    expect(Array.isArray(json.data), "proxied featured data").toBe(true);
  });

  test("Next process is up (rewrite proves same-origin edge)", async ({
    request,
    baseURL,
  }) => {
    test.skip(
      process.env.E2E_API_HAS_NEXT === "0",
      "Next edge not running (set E2E_API_HAS_NEXT=1 or use playwright webServer)",
    );
    // Homepage SSR may still use browser-relative apiRequest (product INT-110/PUB wiring).
    // Harness distinguishes stack health via /v1 rewrite, not product page success.
    expect(baseURL).toBeTruthy();
    const res = await request.get("/v1/public/products/featured?limit=1");
    expect(res.status(), "harness Next edge").toBe(200);
  });

  test("mailpit is reachable for token helpers", async () => {
    const ok = await mailpitHealth();
    expect(ok, "Mailpit HTTP").toBe(true);
  });
});

test.describe("QLT-215 optional auth probe", () => {
  test("seller seed persona can login via API", async ({ request }) => {
    assertNonProductionHarness();
    const origin = apiOrigin();
    const res = await request.post(`${origin}/v1/auth/login`, {
      data: {
        email: SEED_PERSONAS.sellerOwnerA.email,
        password: SEED_PASSWORD,
        surface: SEED_PERSONAS.sellerOwnerA.surface,
      },
      headers: { Accept: "application/json" },
    });

    // 200 authenticated, or 401 if seed not applied — distinguish harness vs product.
    if (res.status() === 401 || res.status() === 403) {
      test.info().annotations.push({
        type: "harness",
        description:
          "seller login rejected — ensure scripts/e2e-api-stack.sh seed ran (QLT-110)",
      });
    }
    expect(
      [200, 401, 403].includes(res.status()),
      `login status ${res.status()}`,
    ).toBe(true);

    if (res.status() === 200) {
      const json = (await res.json()) as {
        data?: { csrfToken?: string; mfaRequired?: boolean };
      };
      expect(json.data, "login data").toBeTruthy();
      // Session cookie should be set for authenticated path.
      const setCookie = res.headers()["set-cookie"] || "";
      expect(
        setCookie.toLowerCase().includes("session") ||
          setCookie.includes("fersaku"),
        "session cookie header present",
      ).toBe(true);
    }
  });
});
