import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { apiOrigin, assertNonProductionHarness } from "./helpers";
import {
  clearEphemeralAuthState,
  isBlockedMockUrl,
  loginViaApi,
  logoutViaApi,
  sanitizeAuthSummary,
  writeEphemeralStorageState,
  authStatePath,
} from "./helpers/auth";
import { maskToken } from "./helpers/mailpit";
import { QLT110_SEED } from "./helpers/seed";

/**
 * QLT-220 parent framework asserts (not full domain matrix).
 * Failures here mean harness/registration/policy regressions, not domain product cells.
 */

const qlt220Root = (() => {
  const cwd = process.cwd();
  // monorepo: frontend package cwd → repo root
  if (/[/]frontend$/.test(cwd)) return path.resolve(cwd, "..");
  return cwd;
})();

function repoPath(rel: string): string {
  if (
    rel.startsWith("backend/") ||
    rel.startsWith("docs/") ||
    rel.startsWith("TASK/") ||
    rel.startsWith("scripts/") ||
    rel.startsWith(".github/")
  ) {
    return path.join(qlt220Root, rel);
  }
  return path.join(qlt220Root, "frontend", rel);
}

test.describe("QLT-220 parent — project registration + isolation", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("mock and API Playwright configs are distinct", () => {
    const mockCfg = readFileSync(repoPath("playwright.config.ts"), "utf8");
    const apiCfg = readFileSync(repoPath("playwright.api.config.ts"), "utf8");

    expect(
      mockCfg.includes('testIgnore: ["**/api/**"]'),
      "mock ignores api/",
    ).toBe(true);
    expect(mockCfg.includes("desktop-chromium"), "mock desktop project").toBe(
      true,
    );
    expect(mockCfg.includes("mobile-chromium"), "mock mobile project").toBe(
      true,
    );
    expect(mockCfg.includes("3100"), "mock base port 3100").toBe(true);

    expect(
      apiCfg.includes("tests/e2e/api") || apiCfg.includes("e2e/api"),
      "api testDir",
    ).toBe(true);
    expect(apiCfg.includes("api-desktop-chromium"), "api project name").toBe(
      true,
    );
    expect(
      apiCfg.includes("NEXT_PUBLIC_DATA_SOURCE"),
      "api DATA_SOURCE env",
    ).toBe(true);
    expect(
      apiCfg.includes('"api"') || apiCfg.includes("'api'"),
      "DATA_SOURCE=api",
    ).toBe(true);
    // API suite must not re-include mock visual/smoke paths.
    expect(
      apiCfg.includes("visual.spec") || apiCfg.includes("smoke.spec"),
    ).toBe(false);
  });

  test("required parent sample specs exist", () => {
    for (const rel of [
      "tests/e2e/api/harness-health.spec.ts",
      "tests/e2e/api/int-190-vertical-slice.spec.ts",
      "tests/e2e/api/gap-08-live-source-smoke.spec.ts",
      "tests/e2e/api/qlt-220-parent-framework.spec.ts",
      "tests/e2e/api/helpers/auth.ts",
      "docs/QLT-220-API-E2E-COEVOLUTION.md",
      "scripts/e2e-api-stack.sh",
    ]) {
      expect(existsSync(repoPath(rel)), rel).toBe(true);
    }
  });

  test("API process env is not mock commerce mode", () => {
    const ds = (process.env.NEXT_PUBLIC_DATA_SOURCE || "").toLowerCase();
    // When Next webServer is used, config forces api; when skip-webserver, base is Go API.
    if (process.env.E2E_API_HAS_NEXT !== "0") {
      expect(
        ["", "api"].includes(ds) || ds === "api",
        `DATA_SOURCE=${ds}`,
      ).toBe(true);
    }
    expect(process.env.APP_ENV?.toLowerCase()).not.toBe("production");
  });
});

test.describe("QLT-220 parent — real auth + ephemeral cookies", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
    clearEphemeralAuthState();
  });

  test.afterAll(() => {
    clearEphemeralAuthState();
  });

  test("seller login via real API writes only ephemeral storage state", async ({
    request,
  }) => {
    const session = await loginViaApi(request, "SELLER");
    expect(session.userId).toBe(QLT110_SEED.personas.sellerOwnerA.userId);
    expect(session.surface).toBe("SELLER");
    expect(session.cookie.length).toBeGreaterThan(8);

    const summary = sanitizeAuthSummary(session);
    expect(summary.includes(session.cookie), "raw cookie not in summary").toBe(
      false,
    );
    expect(summary.includes(session.csrfToken), "raw csrf not in summary").toBe(
      false,
    );
    expect(maskToken(session.cookie)).not.toBe(session.cookie);

    const statePath = writeEphemeralStorageState(session, "seller");
    expect(statePath).toBe(authStatePath("seller"));
    expect(existsSync(statePath)).toBe(true);
    expect(statePath.includes("test-results")).toBe(true);
    expect(statePath.includes(".auth")).toBe(true);

    const raw = readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as {
      cookies?: Array<{ name?: string; value?: string }>;
    };
    expect(parsed.cookies?.some((c) => c.name === "fersaku_session")).toBe(
      true,
    );
    // Storage state must not embed password or seed password field.
    expect(raw.includes(QLT110_SEED.password)).toBe(false);
    expect(raw.toLowerCase().includes("password")).toBe(false);

    test.info().annotations.push({
      type: "auth",
      description: sanitizeAuthSummary(session),
    });

    await logoutViaApi(request, session);
    clearEphemeralAuthState();
    expect(existsSync(authStatePath("seller"))).toBe(false);
  });

  test("buyer login via real API (seed persona)", async ({ request }) => {
    const session = await loginViaApi(request, "BUYER");
    expect(session.userId).toBe(QLT110_SEED.personas.buyerA.userId);
    expect(session.surface).toBe("BUYER");
    await logoutViaApi(request, session);
  });
});

test.describe("QLT-220 parent — no mock simulator network", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("public featured hits live API origin only", async ({ request }) => {
    const origin = apiOrigin().replace(/\/+$/, "");
    expect(isBlockedMockUrl(origin), "api origin not blocklisted").toBe(false);

    const url = `${origin}/v1/public/products/featured?limit=3`;
    expect(isBlockedMockUrl(url)).toBe(false);

    const res = await request.get(url);
    expect(res.status()).toBe(200);
    const json = (await res.json()) as { data?: unknown };
    expect(Array.isArray(json.data)).toBe(true);
  });

  test("blocklist rejects mock simulator hosts", () => {
    expect(isBlockedMockUrl("http://mock.fersaku.test/v1/x")).toBe(true);
    expect(isBlockedMockUrl("http://127.0.0.1:3100/api/mock/cart")).toBe(true);
    expect(isBlockedMockUrl("http://fixture.local/seed")).toBe(true);
    expect(isBlockedMockUrl("http://127.0.0.1:18080/v1/public/products")).toBe(
      false,
    );
    expect(isBlockedMockUrl("http://127.0.0.1:3120/v1/public/products")).toBe(
      false,
    );
  });

  test("Next same-origin rewrite has no mock network (when Next up)", async ({
    page,
    baseURL,
  }) => {
    test.skip(process.env.E2E_API_HAS_NEXT === "0", "Next edge not running");
    expect(baseURL).toBeTruthy();

    const blocked: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (isBlockedMockUrl(u)) blocked.push(u);
    });

    const res = await page.request.get("/v1/public/products/featured?limit=2");
    expect(res.status(), "Next rewrite featured").toBe(200);
    expect(blocked, `mock network: ${blocked.join(", ")}`).toEqual([]);
  });
});

test.describe("QLT-220 parent — secret hygiene", () => {
  test("maskToken never echoes full secret", () => {
    const secret = "abcdefghijklmnopqrstuvwxyz012345";
    const masked = maskToken(secret);
    expect(masked.includes(secret)).toBe(false);
    expect(masked.startsWith("abcd")).toBe(true);
    expect(maskToken(undefined)).toBe("(none)");
    expect(maskToken("short")).toBe("***");
  });

  test("webhook helper summary omits token", async () => {
    const { postFakeXenditPaidCallback } = await import("./helpers/callback");
    // Dry shape only — may 4xx without real intent; summary must stay clean.
    const result = await postFakeXenditPaidCallback({
      eventId: "evt_qlt220_parent",
      providerRef: "qr_qlt220",
      externalId: "ext_qlt220",
      amount: 1000,
    });
    expect(result.summary.toLowerCase().includes("token")).toBe(false);
    expect(result.summary.includes("local-xendit")).toBe(false);
  });
});
