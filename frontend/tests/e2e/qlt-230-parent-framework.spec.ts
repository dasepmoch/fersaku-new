import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { visualRoutes } from "./routes";

/**
 * QLT-230 parent framework asserts (not full domain visual/a11y matrix).
 * Failures here mean harness/registration/policy regressions, not domain cells.
 */

const root = (() => {
  const cwd = process.cwd();
  // monorepo: frontend package cwd → repo root
  if (/[\/]frontend$/.test(cwd)) return path.resolve(cwd, "..");
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
    return path.join(root, rel);
  }
  return path.join(root, "frontend", rel);
}

function countPng(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) n += countPng(p);
    else if (name.endsWith(".png")) n += 1;
  }
  return n;
}

function snapshotName(route: string): string {
  return (
    route.replaceAll(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "home"
  );
}

test.describe("QLT-230 parent — mock registration + isolation", () => {
  test("mock Playwright projects are desktop + mobile; API isolated", () => {
    const mockCfg = readFileSync(repoPath("playwright.config.ts"), "utf8");
    const apiCfg = readFileSync(repoPath("playwright.api.config.ts"), "utf8");

    expect(mockCfg.includes("desktop-chromium"), "desktop project").toBe(true);
    expect(mockCfg.includes("mobile-chromium"), "mobile project").toBe(true);
    expect(
      mockCfg.includes('testIgnore: ["**/api/**"]'),
      "mock ignores api/",
    ).toBe(true);
    expect(
      mockCfg.includes("__screenshots__") ||
        mockCfg.includes("snapshotPathTemplate"),
      "snapshot path template",
    ).toBe(true);
    expect(mockCfg.includes("3100"), "mock base port 3100").toBe(true);

    // API suite must not own mock visual baselines or mock visual.spec.
    expect(
      apiCfg.includes("visual.spec") || apiCfg.includes("smoke.spec"),
    ).toBe(false);
    expect(apiCfg.includes("api-desktop-chromium")).toBe(true);
  });

  test("required parent sample specs and docs exist", () => {
    for (const rel of [
      "tests/e2e/visual.spec.ts",
      "tests/e2e/accessibility.spec.ts",
      "tests/e2e/critical-flows.spec.ts",
      "tests/e2e/smoke.spec.ts",
      "tests/e2e/routes.ts",
      "tests/e2e/fixtures.ts",
      "tests/e2e/qlt-230-parent-framework.spec.ts",
      "docs/QLT-230-VISUAL-A11Y-COEVOLUTION.md",
      "TASK/evidence/UI-060/invariants.md",
      "playwright.config.ts",
    ]) {
      expect(existsSync(repoPath(rel)), rel).toBe(true);
    }
  });
});

test.describe("QLT-230 parent — visual baselines non-empty", () => {
  test("visualRoutes has at least 14 characterization routes", () => {
    expect(visualRoutes.length).toBeGreaterThanOrEqual(14);
  });

  test("committed PNG baselines exist for every visual route × project", () => {
    const desktopDir = path.join(
      root,
      "tests/e2e/__screenshots__/desktop-chromium",
    );
    const mobileDir = path.join(
      root,
      "tests/e2e/__screenshots__/mobile-chromium",
    );
    expect(existsSync(desktopDir), "desktop baselines dir").toBe(true);
    expect(existsSync(mobileDir), "mobile baselines dir").toBe(true);

    const desktop = countPng(desktopDir);
    const mobile = countPng(mobileDir);
    expect(desktop, `desktop png count=${desktop}`).toBeGreaterThanOrEqual(
      visualRoutes.length,
    );
    expect(mobile, `mobile png count=${mobile}`).toBeGreaterThanOrEqual(
      visualRoutes.length,
    );

    for (const route of visualRoutes) {
      const name = `${snapshotName(route)}.png`;
      expect(
        existsSync(path.join(desktopDir, name)),
        `missing desktop baseline: ${name}`,
      ).toBe(true);
      expect(
        existsSync(path.join(mobileDir, name)),
        `missing mobile baseline: ${name}`,
      ).toBe(true);
    }
  });

  test("visual.spec uses stable full-page snapshot options", () => {
    const src = readFileSync(repoPath("tests/e2e/visual.spec.ts"), "utf8");
    expect(src.includes("toHaveScreenshot")).toBe(true);
    expect(src.includes("fullPage")).toBe(true);
    expect(src.includes("animations")).toBe(true);
    expect(src.includes("disabled")).toBe(true);
    expect(src.includes("visualRoutes")).toBe(true);
  });
});

test.describe("QLT-230 parent — a11y + interaction samples", () => {
  test("accessibility suite is non-empty and blocks serious/critical", () => {
    const src = readFileSync(
      repoPath("tests/e2e/accessibility.spec.ts"),
      "utf8",
    );
    expect(src.includes("AxeBuilder") || src.includes("@axe-core")).toBe(true);
    expect(src.includes("serious")).toBe(true);
    expect(src.includes("critical")).toBe(true);
    // Documented contrast debt must stay explicit, not silently dropped.
    expect(src.includes("color-contrast")).toBe(true);
    // At least the frozen a11y sample routes remain listed.
    for (const route of ["/", "/checkout/prod_01", "/dashboard", "/admin"]) {
      expect(
        src.includes(`"${route}"`) || src.includes(`'${route}'`),
        route,
      ).toBe(true);
    }
  });

  test("critical-flows mock interaction samples remain present", () => {
    const src = readFileSync(
      repoPath("tests/e2e/critical-flows.spec.ts"),
      "utf8",
    );
    for (const needle of [
      "checkout",
      "storefront",
      "pagination",
      "theme",
      "notification",
    ]) {
      expect(src.toLowerCase().includes(needle), needle).toBe(true);
    }
  });
});

test.describe("QLT-230 parent — baseline review + API co-evolution policy", () => {
  test("co-evolution doc encodes baseline review and API prerequisites", () => {
    const doc = readFileSync(
      repoPath("docs/QLT-230-VISUAL-A11Y-COEVOLUTION.md"),
      "utf8",
    );
    for (const needle of [
      "co-evolution",
      "capability cell",
      "Baseline update",
      "QLT-110",
      "QLT-215",
      "__screenshots__",
      "frontend-mock-e2e",
      "serious",
      "critical",
    ]) {
      expect(
        doc.toLowerCase().includes(needle.toLowerCase()),
        `doc missing: ${needle}`,
      ).toBe(true);
    }
  });

  test("CI assert suite registers qlt-230 and frontend-mock-e2e", () => {
    const assertSrc = readFileSync(
      repoPath("scripts/ci-assert-suite.mjs"),
      "utf8",
    );
    expect(assertSrc.includes("frontend-mock-e2e")).toBe(true);
    expect(assertSrc.includes("qlt-230-visual-a11y")).toBe(true);
    expect(assertSrc.includes("qlt-230-parent-framework")).toBe(true);
    expect(assertSrc.includes("__screenshots__")).toBe(true);
  });

  test("mock baselines path is not an API-mode capture dump", () => {
    // Parent policy: mock __screenshots__ stay mock-authority; API must not
    // silently share this tree without distinct project (documented in coevo).
    const apiCfg = readFileSync(repoPath("playwright.api.config.ts"), "utf8");
    expect(
      apiCfg.includes("tests/e2e/__screenshots__") &&
        apiCfg.includes("toHaveScreenshot"),
    ).toBe(false);
  });
});
