import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QLT-400 parent framework asserts (not full rollout stages or §3.7 flag cells).
 * Failures here mean harness/registration/policy regressions, not domain cells.
 */

const root = process.cwd();

const MATRIX_CATEGORIES = [
  "Typed registry",
  "Production mock rejection",
  "Emergency kill switch",
  "Canary / allowlist",
  "Hydration parity",
  "Cache cleanup",
  "Telemetry (public-safe)",
] as const;

const REQUIRED_SAMPLES = [
  "shared/data/domain-source.ts",
  "shared/data/domain-source-provider.tsx",
  "shared/data/domain-flags.ts",
  "tests/unit/domain-source.test.ts",
  "tests/unit/domain-flags.test.ts",
  "tests/unit/architecture-boundaries.test.ts",
  "shared/query/QUERY-MUTATION-POLICY.md",
] as const;

function abs(rel: string): string {
  return path.join(root, rel);
}

function minBytes(rel: string, min: number): void {
  const p = abs(rel);
  expect(existsSync(p), `missing ${rel}`).toBe(true);
  const size = statSync(p).size;
  expect(size, `${rel} size=${size}`).toBeGreaterThanOrEqual(min);
}

describe("QLT-400 parent — co-evolution + category registration", () => {
  it("co-evolution doc exists and registers matrix categories", () => {
    const rel = "docs/QLT-400-FLAGS-COEVOLUTION.md";
    minBytes(rel, 2000);
    const src = readFileSync(abs(rel), "utf8");

    for (const cat of MATRIX_CATEGORIES) {
      expect(src.includes(cat), `category registered: ${cat}`).toBe(true);
    }

    for (const needle of [
      "co-evolution",
      "capability cell",
      "qlt-400-flags",
      "mock | api | disabled",
      "emergency",
      "canary",
      "same PR",
      "Do not invent",
      "Parent",
      "never falls back to mock",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `co-evolution marker: ${needle}`,
      ).toBe(true);
    }
  });

  it("parent does not claim full §3.7 cells or invent canary/kill firings", () => {
    const src = readFileSync(abs("docs/QLT-400-FLAGS-COEVOLUTION.md"), "utf8");
    expect(src.includes("§3.7") || src.includes("3.7")).toBe(true);
    expect(
      src.toLowerCase().includes("do not invent") ||
        src.toLowerCase().includes("not invent"),
    ).toBe(true);
    expect(src.includes("Not") || src.includes("does **not**")).toBe(true);
  });
});

describe("QLT-400 parent — required non-empty samples", () => {
  it("INT-025 registry + flags + architecture samples are present", () => {
    for (const rel of REQUIRED_SAMPLES) {
      minBytes(rel, 200);
    }
  });

  it("domain-source exposes mock|api|disabled and production rejection", () => {
    const src = readFileSync(abs("shared/data/domain-source.ts"), "utf8");
    for (const needle of [
      'export type DomainSource = "mock" | "api" | "disabled"',
      "DATA_DOMAINS",
      "evaluateDomainSources",
      "assertProductionDomainSources",
      "DomainDisabledError",
      "shouldUseMockFixtures",
      "withDomainSource",
      "getDomainSource",
      "installDomainSourceSnapshot",
      "readServerOwnedOverrides",
      "DOMAIN_SOURCE_OVERRIDES",
      "rejectMock",
    ]) {
      expect(src.includes(needle), `domain-source: ${needle}`).toBe(true);
    }
  });

  it("domain-flags exposes precedence, kill switch, cache purge, telemetry", () => {
    const src = readFileSync(abs("shared/data/domain-flags.ts"), "utf8");
    for (const needle of [
      "evaluateDomainFlags",
      "EmergencyKillSwitch",
      "buildEmergencyAuditEvent",
      "resolveCanarySource",
      "canaryBucket",
      "purgeDomainCachesOnSourceChange",
      "applyDomainSourceChange",
      "domainSourceKeySegment",
      "buildDomainSourceTelemetry",
      "DEFAULT_KILL_SWITCH_PROPAGATION_SLO_MS",
      "readServerOwnedEmergencyControls",
      "readServerOwnedCanary",
      "DOMAIN_SOURCE_EMERGENCY",
    ]) {
      expect(src.includes(needle), `domain-flags: ${needle}`).toBe(true);
    }
  });

  it("domain-source-provider installs hydration snapshot", () => {
    const src = readFileSync(
      abs("shared/data/domain-source-provider.tsx"),
      "utf8",
    );
    for (const needle of [
      "DomainSourceProvider",
      "installDomainSourceSnapshot",
      "toPublicDomainSourceSnapshot",
      "useDomainSourceSnapshot",
    ]) {
      expect(src.includes(needle), `provider: ${needle}`).toBe(true);
    }
  });

  it("domain-source unit samples cover production reject + disabled", () => {
    const src = readFileSync(abs("tests/unit/domain-source.test.ts"), "utf8");
    for (const needle of [
      "production/live rejects residual mock",
      "disabled never uses mock fixtures",
      "withDomainSource never invokes mock when disabled",
      "SSR snapshot install",
      "assertProductionDomainSources",
    ]) {
      expect(src.includes(needle), `domain-source.test: ${needle}`).toBe(true);
    }
  });

  it("domain-flags unit samples cover precedence + kill + cache", () => {
    const src = readFileSync(abs("tests/unit/domain-flags.test.ts"), "utf8");
    for (const needle of [
      "emergency kill beats canary",
      "purgeDomainCachesOnSourceChange",
      "buildEmergencyAuditEvent",
      "live rewrites residual mock",
      "kill switch stops adapter",
    ]) {
      expect(src.includes(needle), `domain-flags.test: ${needle}`).toBe(true);
    }
  });

  it("architecture-boundaries forbids isLiveApi outside registry", () => {
    const src = readFileSync(
      abs("tests/unit/architecture-boundaries.test.ts"),
      "utf8",
    );
    expect(src.includes("isLiveApi")).toBe(true);
    expect(src.includes("getDomainSource")).toBe(true);
  });

  it("query policy documents source-change cache cleanup", () => {
    const src = readFileSync(
      abs("shared/query/QUERY-MUTATION-POLICY.md"),
      "utf8",
    );
    expect(src.includes("QLT-400")).toBe(true);
    expect(src.includes("purgeDomainCachesOnSourceChange")).toBe(true);
  });
});

describe("QLT-400 parent — CI suite registration", () => {
  it("ci-assert-suite registers qlt-400-flags", () => {
    const src = readFileSync(abs("scripts/ci-assert-suite.mjs"), "utf8");
    expect(src.includes('case "qlt-400-flags"')).toBe(true);
    expect(src.includes("QLT-400-FLAGS-COEVOLUTION")).toBe(true);
  });

  it("package.json and CI wire flags asserts", () => {
    const pkg = readFileSync(abs("package.json"), "utf8");
    expect(pkg.includes("ci:assert:flags")).toBe(true);
    expect(pkg.includes("qlt-400-flags")).toBe(true);

    const ci = readFileSync(abs(".github/workflows/ci.yml"), "utf8");
    expect(ci.includes("qlt-400-flags")).toBe(true);
  });
});
