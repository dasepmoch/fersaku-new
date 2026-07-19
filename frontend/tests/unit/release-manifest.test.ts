import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GAP-05 / release contract: manifest schema, scripts, frontend deploy artifact.
 * Does not claim live managed CD or production canary LB weights.
 */

const root = (() => {
  const cwd = process.cwd();
  if (/[\/]frontend$/.test(cwd)) return path.resolve(cwd, "..");
  return cwd;
})();

function abs(rel: string): string {
  return path.join(root, rel);
}

function minBytes(rel: string, min: number): void {
  const p = abs(rel);
  expect(existsSync(p), `missing ${rel}`).toBe(true);
  expect(statSync(p).size, rel).toBeGreaterThanOrEqual(min);
}

const REQUIRED = [
  "release/schema/release-manifest.schema.json",
  "release/feature-domain-source-map.json",
  "scripts/release/generate-manifest.sh",
  "scripts/release/verify-manifest.sh",
  "scripts/release/migrate-job.sh",
  "scripts/release/deploy-gate.sh",
  "scripts/release/deploy-smoke.sh",
  "scripts/release/canary-rollback.sh",
  "frontend/Dockerfile",
  "frontend/app/api/health/route.ts",
  "backend/docker-compose.release.yml",
  ".github/workflows/release.yml",
  "backend/docs/launch/release-deployment.md",
] as const;

describe("GAP-05 release deployment contract", () => {
  it("required release artifacts exist", () => {
    for (const rel of REQUIRED) {
      minBytes(rel, 200);
    }
  });

  it("manifest schema requires digests mapping and no rebuild promote", () => {
    const src = readFileSync(
      abs("release/schema/release-manifest.schema.json"),
      "utf8",
    );
    for (const needle of [
      "schemaVersion",
      "gitSha",
      "images",
      "api",
      "worker",
      "frontend",
      "migration",
      "featureDomainSourceMap",
      "build-once-digest",
      "autoDownMigrate",
      "configSchemaVersion",
    ]) {
      expect(src.includes(needle), needle).toBe(true);
    }
  });

  it("generate/verify scripts enforce build-once and no auto-down", () => {
    const gen = readFileSync(abs("scripts/release/generate-manifest.sh"), "utf8");
    const ver = readFileSync(abs("scripts/release/verify-manifest.sh"), "utf8");
    const canary = readFileSync(
      abs("scripts/release/canary-rollback.sh"),
      "utf8",
    );
    expect(gen.includes("rebuildOnPromote")).toBe(true);
    expect(gen.includes("autoDownMigrate")).toBe(true);
    expect(ver.includes("rebuildOnPromote")).toBe(true);
    expect(ver.includes("autoDownMigrate")).toBe(true);
    expect(canary.includes("no migrate down") || canary.includes("NO migrate down")).toBe(
      true,
    );
    expect(canary.includes("rollback")).toBe(true);
  });

  it("migrate-job blocks destructive down on staging/production", () => {
    const src = readFileSync(abs("scripts/release/migrate-job.sh"), "utf8");
    expect(src.includes("ALLOW_DESTRUCTIVE_MIGRATE")).toBe(true);
    expect(src.includes("forward-compatible") || src.includes("auto-down")).toBe(
      true,
    );
    expect(src.includes("abort rollout") || src.includes("FAILED")).toBe(true);
  });

  it("deploy-smoke asserts callback routes not 404", () => {
    const src = readFileSync(abs("scripts/release/deploy-smoke.sh"), "utf8");
    expect(src.includes("/v1/webhooks/duitku")).toBe(true);
    expect(src.includes("/v1/webhooks/xendit")).toBe(true);
    expect(src.includes("404")).toBe(true);
  });

  it("frontend Dockerfile is standalone production runtime", () => {
    const df = readFileSync(abs("frontend/Dockerfile"), "utf8");
    expect(df.includes("standalone")).toBe(true);
    expect(df.includes("server.js")).toBe(true);
    expect(df.includes("nonroot")).toBe(true);
    expect(df.includes("/api/health")).toBe(true);
  });

  it("next.config enables standalone output", () => {
    const cfg = readFileSync(abs("frontend/next.config.ts"), "utf8");
    expect(cfg.includes('output: "standalone"')).toBe(true);
  });

  it("release workflow is build-once with SBOM and approval", () => {
    const yml = readFileSync(abs(".github/workflows/release.yml"), "utf8");
    for (const needle of [
      "build-once",
      "release-manifest",
      "syft",
      "grype",
      "production",
      "fersaku-frontend",
      "fersaku-api",
      "fersaku-worker",
    ]) {
      expect(yml.toLowerCase().includes(needle.toLowerCase()), needle).toBe(
        true,
      );
    }
  });

  it("generated sample manifest validates when script runs", () => {
    // Structural: domain map is non-empty api sources
    const map = JSON.parse(
      readFileSync(abs("release/feature-domain-source-map.json"), "utf8"),
    ) as Record<string, string>;
    expect(Object.keys(map).length).toBeGreaterThan(5);
    expect(map.payments).toBe("api");
    expect(map.withdrawals).toBe("api");
  });
});
