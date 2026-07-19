import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QLT-310 parent framework asserts (not full performance/smoothness matrix cells).
 * Failures here mean harness/registration/policy regressions, not domain cells.
 */

const root = (() => {
  const cwd = process.cwd();
  // monorepo: frontend package cwd → repo root
  if (/[\/]frontend$/.test(cwd)) return path.resolve(cwd, "..");
  return cwd;
})();

const MATRIX_CATEGORIES = [
  "FE interaction guards",
  "BE budget categories",
  "UX smoothness policy",
] as const;

const REQUIRED_SAMPLES = [
  "scripts/check-bundle-budget.mjs",
  "shared/query/query-policy.ts",
  "shared/query/mutation-policy.ts",
  "shared/query/QUERY-MUTATION-POLICY.md",
  "tests/unit/int-160-query-mutation.test.ts",
  "features/commerce/checkout/poll.ts",
  "tests/unit/chk-120-checkout-poll.test.ts",
  "shared/api/http-client.ts",
  "tests/unit/http-client.test.ts",
] as const;

function abs(rel: string): string {
  if (
    rel.startsWith("backend/") ||
    rel.startsWith("docs/") ||
    rel.startsWith("TASK/") ||
    rel.startsWith("scripts/") ||
    rel.startsWith(".github/")
  ) {
    return path.join(root, rel);
  }
  // Frontend package paths (shared/, tests/, features/, package.json, playwright, etc.)
  return path.join(root, "frontend", rel);
}

function minBytes(rel: string, min: number): void {
  const p = abs(rel);
  expect(existsSync(p), `missing ${rel}`).toBe(true);
  const size = statSync(p).size;
  expect(size, `${rel} size=${size}`).toBeGreaterThanOrEqual(min);
}

describe("QLT-310 parent — co-evolution + category registration", () => {
  it("co-evolution doc exists and registers three matrix categories", () => {
    const rel = "docs/QLT-310-PERFORMANCE-COEVOLUTION.md";
    minBytes(rel, 2000);
    const src = readFileSync(abs(rel), "utf8");

    for (const cat of MATRIX_CATEGORIES) {
      expect(src.includes(cat), `category registered: ${cat}`).toBe(true);
    }

    for (const needle of [
      "co-evolution",
      "capability cell",
      "qlt-310-performance",
      "check-bundle-budget",
      "no overlapping",
      "same PR",
      "Do not invent",
      "Parent",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `co-evolution marker: ${needle}`,
      ).toBe(true);
    }
  });

  it("parent does not claim full §3.7 cells or invent load-test results", () => {
    const src = readFileSync(
      abs("docs/QLT-310-PERFORMANCE-COEVOLUTION.md"),
      "utf8",
    );
    expect(src.includes("§3.7") || src.includes("3.7")).toBe(true);
    expect(
      src.toLowerCase().includes("load-test") ||
        src.toLowerCase().includes("load test"),
    ).toBe(true);
    expect(src.includes("Not") || src.includes("does **not**")).toBe(true);
  });
});

describe("QLT-310 parent — required non-empty samples", () => {
  it("bundle, query policy, poll, and timeout sample files are present", () => {
    for (const rel of REQUIRED_SAMPLES) {
      minBytes(rel, 200);
    }
  });

  it("bundle budget script keeps size caps", () => {
    const src = readFileSync(abs("scripts/check-bundle-budget.mjs"), "utf8");
    for (const needle of ["maxChunkBytes", "maxTotalBytes", "Bundle budget"]) {
      expect(src.includes(needle), `check-bundle-budget: ${needle}`).toBe(true);
    }
  });

  it("query policy keeps keepPrevious + exact invalidation + surface stale times", () => {
    const src = readFileSync(abs("shared/query/query-policy.ts"), "utf8");
    for (const needle of [
      "keepPreviousData",
      "matchesExactQueryKey",
      "staleTimeForSurface",
      "shouldRetrySafeGet",
    ]) {
      expect(src.includes(needle), `query-policy: ${needle}`).toBe(true);
    }

    const policy = readFileSync(
      abs("shared/query/QUERY-MUTATION-POLICY.md"),
      "utf8",
    );
    for (const needle of ["Debounce", "keepPrevious", "exact invalidation"]) {
      expect(
        policy.toLowerCase().includes(needle.toLowerCase()),
        `QUERY-MUTATION-POLICY: ${needle}`,
      ).toBe(true);
    }
  });

  it("checkout poll sample enforces no-overlap and abort", () => {
    const poll = readFileSync(
      abs("features/commerce/checkout/poll.ts"),
      "utf8",
    );
    for (const needle of [
      "createCheckoutIntentPollController",
      "nextCheckoutPollDelayMs",
      "hidden",
    ]) {
      expect(poll.includes(needle), `poll.ts: ${needle}`).toBe(true);
    }

    const test = readFileSync(
      abs("tests/unit/chk-120-checkout-poll.test.ts"),
      "utf8",
    );
    expect(test.includes("no overlapping polls")).toBe(true);
    expect(test.toLowerCase().includes("abort")).toBe(true);
  });

  it("http-client timeout sample aborts on elapsed timeout", () => {
    const client = readFileSync(abs("shared/api/http-client.ts"), "utf8");
    for (const needle of [
      "timeoutMs",
      "DEFAULT_TIMEOUT_MS",
      "AbortController",
    ]) {
      expect(client.includes(needle), `http-client: ${needle}`).toBe(true);
    }

    const test = readFileSync(abs("tests/unit/http-client.test.ts"), "utf8");
    expect(test.includes("timeout")).toBe(true);
    expect(test.includes("aborts a request when the timeout elapses")).toBe(
      true,
    );
  });
});

describe("QLT-310 parent — CI suite registration", () => {
  it("ci-assert-suite registers qlt-310-performance", () => {
    const src = readFileSync(abs("scripts/ci-assert-suite.mjs"), "utf8");
    expect(src.includes('case "qlt-310-performance"')).toBe(true);
    expect(src.includes("QLT-310-PERFORMANCE-COEVOLUTION")).toBe(true);
  });

  it("package.json and CI wire performance asserts + bundle budget", () => {
    const pkg = readFileSync(abs("package.json"), "utf8");
    expect(pkg.includes("ci:assert:performance")).toBe(true);
    expect(pkg.includes("qlt-310-performance")).toBe(true);
    expect(pkg.includes("check:bundle")).toBe(true);

    const ci = readFileSync(abs(".github/workflows/ci.yml"), "utf8");
    expect(ci.includes("qlt-310-performance")).toBe(true);
    expect(ci.includes("check:bundle") || ci.includes("bundle budget")).toBe(
      true,
    );
  });
});
