import { test, expect, type Page } from "@playwright/test";
import { assertNonProductionHarness } from "./helpers";

/**
 * GAP-08 — live-source smoke: when NEXT_PUBLIC_DATA_SOURCE=api (or API e2e
 * harness), rendered surfaces must not show known mock fixture identities.
 * Distinguishes mock-only e2e (critical-flows) from production-shaped bundles.
 */

/** Known mock fixture markers that must not appear in live/API rendered UI. */
const FORBIDDEN_FIXTURE_MARKERS = [
  "asep@ai.tools",
  "sinta@uipack.id",
  "raka@automation.club",
  "usr_01H8A2",
  "usr_01H8K1",
  "usr_01H8L8",
  "Asep AI Tools",
  "UI Pack House",
  "Automation Club",
  "dinda@fersaku.id",
  "mock-admin-session",
] as const;

async function assertNoFixtureMarkers(page: Page, route: string) {
  const body = page.locator("body");
  await expect(body).toBeVisible();
  const text = (await body.innerText()).toLowerCase();
  for (const marker of FORBIDDEN_FIXTURE_MARKERS) {
    expect(
      text.includes(marker.toLowerCase()),
      `${route} must not render fixture marker: ${marker}`,
    ).toBe(false);
  }
}

test.describe("GAP-08 live-source smoke (API mode)", () => {
  test.beforeAll(() => {
    assertNonProductionHarness();
  });

  test("process is not mock commerce mode", () => {
    const ds = (process.env.NEXT_PUBLIC_DATA_SOURCE || "").toLowerCase();
    expect(
      ds === "api" || ds === "",
      `expected DATA_SOURCE api|empty, got ${ds}`,
    ).toBe(true);
  });

  test("contact deferred submit is disabled and has no fixture success", async ({
    page,
  }) => {
    const res = await page.goto("/contact", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(400);
    const submit = page.getByRole("button", { name: /Kirim pesan/i });
    if ((await submit.count()) > 0) {
      await expect(submit.first()).toBeDisabled();
    }
    await expect(page.getByText("Pesan terkirim.")).toHaveCount(0);
    await assertNoFixtureMarkers(page, "/contact");
  });

  test("public storefront does not inject demo seller fixture ids", async ({
    page,
  }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(400);
    await assertNoFixtureMarkers(page, "/");
  });

  test("buyer library route does not render demo seller fixtures", async ({
    page,
  }) => {
    // Unauthenticated may redirect to login — still must not show seller demo rows.
    const res = await page.goto("/account/library", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await assertNoFixtureMarkers(page, "/account/library");
  });

  test("admin users does not render demo seller rows without session", async ({
    page,
  }) => {
    const res = await page.goto("/admin/users", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await assertNoFixtureMarkers(page, "/admin/users");
    // Fixture Open-as-user targets must not be present as demo list content
    await expect(page.getByText("asep@ai.tools")).toHaveCount(0);
    await expect(page.getByText("usr_01H8A2")).toHaveCount(0);
  });

  test("admin overview does not render demo seller fixture ids", async ({
    page,
  }) => {
    const res = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await assertNoFixtureMarkers(page, "/admin");
  });

  test("admin payments does not render demo seller fixture ids", async ({
    page,
  }) => {
    const res = await page.goto("/admin/payments", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await assertNoFixtureMarkers(page, "/admin/payments");
  });

  test("admin KYC does not render demo seller fixture ids", async ({
    page,
  }) => {
    const res = await page.goto("/admin/kyc", {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await assertNoFixtureMarkers(page, "/admin/kyc");
  });
});
