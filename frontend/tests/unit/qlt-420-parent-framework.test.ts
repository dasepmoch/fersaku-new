import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QLT-420 parent framework asserts (not G0..G8 green, live canary, or §3.7 cells).
 * Failures here mean harness/registration/policy regressions, not cutover completion.
 */

const root = (() => {
  const cwd = process.cwd();
  // monorepo: frontend package cwd → repo root
  if (/[\/]frontend$/.test(cwd)) return path.resolve(cwd, "..");
  return cwd;
})();

const CUTOVER_CATEGORIES = [
  "G0..G8 master gates",
  "On-call / dashboards / alerts / credentials / backup",
  "Health / readiness / synthetic",
  "Flags / canary / rollback commands",
  "Release bundling",
  "Owner communication",
] as const;

const CLEANUP_RULES = [
  "Compatibility aliases",
  "Architecture mock ban",
  "Mock only nonprod",
  "Truthful docs",
  "Archive rollout flags",
  "Retention / secrets",
  "Global DATA_SOURCE deprecation",
] as const;

const REQUIRED_SAMPLES = [
  "backend/docs/launch/readiness-checklist.md",
  "backend/docs/launch/canary-rollback.md",
  "backend/docs/launch/e2e-acceptance.md",
  "tests/unit/architecture-boundaries.test.ts",
  "shared/data/domain-source.ts",
  "tests/unit/domain-source.test.ts",
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

describe("QLT-420 parent — co-evolution + cutover registration", () => {
  it("co-evolution doc exists and registers cutover categories + cleanup rules", () => {
    const rel = "docs/QLT-420-CUTOVER-COEVOLUTION.md";
    minBytes(rel, 2000);
    const src = readFileSync(abs(rel), "utf8");

    for (const cat of CUTOVER_CATEGORIES) {
      expect(src.includes(cat), `category registered: ${cat}`).toBe(true);
    }

    for (const rule of CLEANUP_RULES) {
      expect(src.includes(rule), `cleanup rule registered: ${rule}`).toBe(true);
    }

    for (const needle of [
      "co-evolution",
      "capability cell",
      "qlt-420-cutover",
      "post-cutover",
      "Do not invent",
      "Parent",
      "mock",
      "observation window",
      "NEXT_PUBLIC_DATA_SOURCE",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `co-evolution marker: ${needle}`,
      ).toBe(true);
    }
  });

  it("parent does not claim G0..G8 green, live canary, or invent cutover results", () => {
    const src = readFileSync(
      abs("docs/QLT-420-CUTOVER-COEVOLUTION.md"),
      "utf8",
    );
    expect(src.includes("G0..G8") || src.includes("G0")).toBe(true);
    expect(
      src.toLowerCase().includes("do not invent") ||
        src.toLowerCase().includes("not invent"),
    ).toBe(true);
    expect(src.includes("Not") || src.includes("does **not**")).toBe(true);
    expect(
      src.toLowerCase().includes("live canary") || src.includes("full-cutover"),
    ).toBe(true);
  });
});

describe("QLT-420 parent — required non-empty samples", () => {
  it("readiness, canary-rollback, e2e-acceptance, architecture, domain-source present", () => {
    for (const rel of REQUIRED_SAMPLES) {
      minBytes(rel, 200);
    }
  });

  it("readiness-checklist covers health, secrets, alerts, owner-sign", () => {
    const src = readFileSync(
      abs("backend/docs/launch/readiness-checklist.md"),
      "utf8",
    );
    for (const needle of [
      "Owner-sign",
      "Migrations",
      "Secrets",
      "Alerts",
      "callback",
      "PITR",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `readiness: ${needle}`,
      ).toBe(true);
    }
  });

  it("canary-rollback documents canary, immutable image, no auto migrate down", () => {
    const src = readFileSync(
      abs("backend/docs/launch/canary-rollback.md"),
      "utf8",
    );
    for (const needle of [
      "canary",
      "Rollback",
      "immutable",
      "migrate",
      "callback",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `canary-rollback: ${needle}`,
      ).toBe(true);
    }
    expect(
      src.includes("Do not") ||
        src.toLowerCase().includes("do not auto-down") ||
        src.toLowerCase().includes("forward-compatible"),
    ).toBe(true);
  });

  it("e2e-acceptance maps gate commands and proof", () => {
    const src = readFileSync(
      abs("backend/docs/launch/e2e-acceptance.md"),
      "utf8",
    );
    for (const needle of [
      "Gate commands",
      "integration",
      "synthetic",
      "security",
      "Proof",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `e2e-acceptance: ${needle}`,
      ).toBe(true);
    }
  });

  it("architecture-boundaries bans mock authority in API presentation paths", () => {
    const src = readFileSync(
      abs("tests/unit/architecture-boundaries.test.ts"),
      "utf8",
    );
    for (const needle of ["mock", "architecture", "describe", "expect"]) {
      expect(
        src.toLowerCase().includes(needle),
        `architecture: ${needle}`,
      ).toBe(true);
    }
    expect(src.length).toBeGreaterThan(500);
  });

  it("domain-source rejects production/live mock", () => {
    const src = readFileSync(abs("shared/data/domain-source.ts"), "utf8");
    for (const needle of [
      "assertProductionDomainSources",
      "rejectMock",
      'DomainSource = "mock" | "api" | "disabled"',
      "evaluateDomainSources",
    ]) {
      expect(src.includes(needle), `domain-source: ${needle}`).toBe(true);
    }

    const unit = readFileSync(abs("tests/unit/domain-source.test.ts"), "utf8");
    expect(
      unit.includes("assertProductionDomainSources") ||
        unit.toLowerCase().includes("production") ||
        unit.toLowerCase().includes("reject"),
    ).toBe(true);
  });
});

describe("QLT-420 parent — CI suite registration", () => {
  it("ci-assert-suite registers qlt-420-cutover", () => {
    const src = readFileSync(abs("scripts/ci-assert-suite.mjs"), "utf8");
    expect(src.includes('case "qlt-420-cutover"')).toBe(true);
    expect(src.includes("QLT-420-CUTOVER-COEVOLUTION")).toBe(true);
  });

  it("package.json and CI wire cutover asserts", () => {
    const pkg = readFileSync(abs("package.json"), "utf8");
    expect(pkg.includes("ci:assert:cutover")).toBe(true);
    expect(pkg.includes("qlt-420-cutover")).toBe(true);

    const ci = readFileSync(abs(".github/workflows/ci.yml"), "utf8");
    expect(ci.includes("qlt-420-cutover")).toBe(true);
  });
});
