import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QLT-300 parent framework asserts (not full security/privacy matrix cells).
 * Failures here mean harness/registration/policy regressions, not domain cells.
 */

const root = (() => {
  const cwd = process.cwd();
  // monorepo: frontend package cwd → repo root
  if (/[\/]frontend$/.test(cwd)) return path.resolve(cwd, "..");
  return cwd;
})();

const MATRIX_CATEGORIES = [
  "Identity/session",
  "Authorization",
  "Money/state",
  "Secret/data",
  "Abuse/resilience",
] as const;

const FE_SAMPLES = [
  "tests/unit/csrf.test.ts",
  "tests/unit/int-140-mfa.test.ts",
  "tests/unit/session-int-120.test.ts",
  "tests/unit/architecture-boundaries.test.ts",
  "tests/unit/int-170-error-mock-observability.test.ts",
  "tests/unit/int-160-query-mutation.test.ts",
  "tests/unit/chk-110-checkout-intent.test.ts",
] as const;

const BE_SAMPLES = [
  "backend/test/integration/security_verification_test.go",
  "backend/test/integration/mfa_pending_int140_test.go",
  "backend/test/integration/rbac_test.go",
] as const;

const BE_SECURITY_MARKERS = [
  "TestSecurity_CSRFOnUnsafeCookieMethods",
  "TestSecurity_StaleCookieAllowsAnonymousLogin",
  "TestSecurity_SessionExpiry",
  "TestSecurity_CrossTenant404",
  "TestSecurity_RawCredentialNeverInList",
  "TestSecurity_ImpersonationDefaultDeny",
  "TestSecurity_SSRFPrivateURLReject",
  "TestSecurity_WebhookPrivateNetwork",
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

describe("QLT-300 parent — co-evolution + category registration", () => {
  it("co-evolution doc exists and registers five matrix categories", () => {
    const rel = "docs/QLT-300-SECURITY-COEVOLUTION.md";
    minBytes(rel, 2000);
    const src = readFileSync(abs(rel), "utf8");

    for (const cat of MATRIX_CATEGORIES) {
      expect(src.includes(cat), `category registered: ${cat}`).toBe(true);
    }

    for (const needle of [
      "co-evolution",
      "capability cell",
      "qlt-300-security",
      "security_verification_test.go",
      "same PR",
      "No production secrets",
      "Parent",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `co-evolution marker: ${needle}`,
      ).toBe(true);
    }
  });

  it("parent does not claim full §3.7 cells or invent pentest", () => {
    const src = readFileSync(
      abs("docs/QLT-300-SECURITY-COEVOLUTION.md"),
      "utf8",
    );
    expect(src.includes("§3.7") || src.includes("3.7")).toBe(true);
    expect(src.toLowerCase().includes("pentest")).toBe(true);
    expect(src.includes("Not") || src.includes("does **not**")).toBe(true);
  });
});

describe("QLT-300 parent — required FE unit samples", () => {
  it("FE security sample files are present and non-empty", () => {
    for (const rel of FE_SAMPLES) {
      minBytes(rel, 500);
    }
  });

  it("CSRF + MFA + session samples keep security markers", () => {
    const csrf = readFileSync(abs("tests/unit/csrf.test.ts"), "utf8");
    for (const needle of [
      "ensureCsrfToken",
      "assertCsrfNotInWebStorage",
      "withCsrfRecovery",
      "CSRF",
    ]) {
      expect(csrf.includes(needle), `csrf.test.ts: ${needle}`).toBe(true);
    }

    const mfa = readFileSync(abs("tests/unit/int-140-mfa.test.ts"), "utf8");
    for (const needle of [
      "assertRecentMfaProofNotInWebStorage",
      "mfa_pending",
      "requireMfaVerified",
    ]) {
      expect(mfa.includes(needle), `int-140-mfa.test.ts: ${needle}`).toBe(true);
    }

    const session = readFileSync(
      abs("tests/unit/session-int-120.test.ts"),
      "utf8",
    );
    for (const needle of ["returnTo", "logout", "csrf"]) {
      expect(
        session.toLowerCase().includes(needle.toLowerCase()),
        `session-int-120: ${needle}`,
      ).toBe(true);
    }
  });
});

describe("QLT-300 parent — required BE integration samples", () => {
  it("BE security sample files are present and non-empty", () => {
    for (const rel of BE_SAMPLES) {
      minBytes(rel, 400);
    }
  });

  it("security_verification_test.go keeps consolidated TestSecurity_ markers", () => {
    const src = readFileSync(
      abs("backend/test/integration/security_verification_test.go"),
      "utf8",
    );
    expect(src.includes("//go:build integration")).toBe(true);
    for (const marker of BE_SECURITY_MARKERS) {
      expect(src.includes(marker), `BE marker: ${marker}`).toBe(true);
    }
  });
});

describe("QLT-300 parent — CI suite registration", () => {
  it("ci-assert-suite registers qlt-300-security and security-negative", () => {
    const src = readFileSync(abs("scripts/ci-assert-suite.mjs"), "utf8");
    expect(src.includes('case "qlt-300-security"')).toBe(true);
    expect(src.includes('case "security-negative"')).toBe(true);
    expect(src.includes("QLT-300-SECURITY-COEVOLUTION")).toBe(true);
  });

  it("package.json and CI wire security asserts", () => {
    const pkg = readFileSync(abs("package.json"), "utf8");
    expect(pkg.includes("ci:assert:security")).toBe(true);
    expect(pkg.includes("qlt-300-security")).toBe(true);

    const ci = readFileSync(abs(".github/workflows/ci.yml"), "utf8");
    expect(
      ci.includes("qlt-300-security") || ci.includes("security-negative"),
    ).toBe(true);
  });
});
