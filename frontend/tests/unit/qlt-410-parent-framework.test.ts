import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QLT-410 parent framework asserts (not full staging rehearsal or §3.7 rollback cells).
 * Failures here mean harness/registration/policy regressions, not domain cells.
 */

const root = (() => {
  const cwd = process.cwd();
  // monorepo: frontend package cwd → repo root
  if (/[\/]frontend$/.test(cwd)) return path.resolve(cwd, "..");
  return cwd;
})();

const EXPAND_CONTRACT_STEPS = [
  "Expand schema/API",
  "Dual-write / dual-read backend",
  "Backfill",
  "Consumer roll",
  "Contract",
] as const;

const HARD_RULES = [
  "No FE rollback via destructive migrate down",
  "Rolling compatibility window",
  "Worker/API deploy order",
  "Long index/backfill",
  "Checksum / restore point",
  "Callbacks accepted",
  "Idempotency / state machines",
  "Immutable digests",
  "Money facts are not rolled back",
] as const;

const REQUIRED_SAMPLES = [
  "backend/migrations/README.md",
  "backend/scripts/migrate.sh",
  "backend/docs/launch/canary-rollback.md",
  "backend/docs/launch/topology.md",
  "backend/docs/runbooks/backup-restore-integrity.md",
  "backend/test/integration/foundation_test.go",
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

describe("QLT-410 parent — co-evolution + expand-contract registration", () => {
  it("co-evolution doc exists and registers expand-contract steps", () => {
    const rel = "docs/QLT-410-DEPLOY-ROLLBACK-COEVOLUTION.md";
    minBytes(rel, 2000);
    const src = readFileSync(abs(rel), "utf8");

    for (const step of EXPAND_CONTRACT_STEPS) {
      expect(src.includes(step), `step registered: ${step}`).toBe(true);
    }

    for (const rule of HARD_RULES) {
      expect(src.includes(rule), `rule registered: ${rule}`).toBe(true);
    }

    for (const needle of [
      "co-evolution",
      "capability cell",
      "qlt-410-deploy",
      "expand-contract",
      "migrate down",
      "code/flags only",
      "Do not invent",
      "Parent",
      "immutable",
      "callback",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `co-evolution marker: ${needle}`,
      ).toBe(true);
    }
  });

  it("parent does not claim full §3.7 cells or invent production drills", () => {
    const src = readFileSync(
      abs("docs/QLT-410-DEPLOY-ROLLBACK-COEVOLUTION.md"),
      "utf8",
    );
    expect(src.includes("§3.7") || src.includes("3.7")).toBe(true);
    expect(
      src.toLowerCase().includes("do not invent") ||
        src.toLowerCase().includes("not invent"),
    ).toBe(true);
    expect(src.includes("Not") || src.includes("does **not**")).toBe(true);
  });
});

describe("QLT-410 parent — required non-empty samples", () => {
  it("migrate scripts, canary-rollback, topology, backup-restore, foundation tests present", () => {
    for (const rel of REQUIRED_SAMPLES) {
      minBytes(rel, 200);
    }
  });

  it("migrations README separates migrate vs app role", () => {
    const src = readFileSync(abs("backend/migrations/README.md"), "utf8");
    for (const needle of [
      "migrate",
      "app",
      "golang-migrate",
      "schema_migrations",
    ]) {
      expect(src.toLowerCase().includes(needle), `README: ${needle}`).toBe(
        true,
      );
    }
    expect(src.includes("Must **not**") || src.includes("must **not**")).toBe(
      true,
    );
  });

  it("migrate.sh is the non-app migrate runner", () => {
    const src = readFileSync(abs("backend/scripts/migrate.sh"), "utf8");
    for (const needle of [
      "golang-migrate",
      "MIGRATIONS_PATH",
      "DATABASE_URL",
      "up)",
      "down)",
      "version)",
    ]) {
      expect(src.includes(needle), `migrate.sh: ${needle}`).toBe(true);
    }
  });

  it("canary-rollback documents image rollback and no auto migrate down", () => {
    const src = readFileSync(
      abs("backend/docs/launch/canary-rollback.md"),
      "utf8",
    );
    for (const needle of [
      "Rollback",
      "immutable",
      "migrate",
      "callback",
      "canary",
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

  it("topology documents migrate job then rolling API/worker", () => {
    const src = readFileSync(abs("backend/docs/launch/topology.md"), "utf8");
    for (const needle of [
      "migrate job",
      "rolling",
      "fersaku-api",
      "fersaku-worker",
      "outbox",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `topology: ${needle}`,
      ).toBe(true);
    }
  });

  it("backup-restore captures restore point / integrity", () => {
    const src = readFileSync(
      abs("backend/docs/runbooks/backup-restore-integrity.md"),
      "utf8",
    );
    for (const needle of ["restore", "PITR", "migration", "integrity"]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `backup-restore: ${needle}`,
      ).toBe(true);
    }
  });

  it("foundation migrate tests cover up-from-zero and upgrade path", () => {
    const src = readFileSync(
      abs("backend/test/integration/foundation_test.go"),
      "utf8",
    );
    for (const needle of [
      "TestMigrateUpFromZero",
      "TestMigrateUpgradeFromSupportedPrevious",
      "runMigrate",
      "TestConcurrentIdempotencyFirstWriterWins",
      "TestAtomicCommitRollbackOnOutboxFailure",
    ]) {
      expect(src.includes(needle), `foundation_test: ${needle}`).toBe(true);
    }
  });
});

describe("QLT-410 parent — CI suite registration", () => {
  it("ci-assert-suite registers qlt-410-deploy", () => {
    const src = readFileSync(abs("scripts/ci-assert-suite.mjs"), "utf8");
    expect(src.includes('case "qlt-410-deploy"')).toBe(true);
    expect(src.includes("QLT-410-DEPLOY-ROLLBACK-COEVOLUTION")).toBe(true);
  });

  it("package.json and CI wire deploy asserts", () => {
    const pkg = readFileSync(abs("package.json"), "utf8");
    expect(pkg.includes("ci:assert:deploy")).toBe(true);
    expect(pkg.includes("qlt-410-deploy")).toBe(true);

    const ci = readFileSync(abs(".github/workflows/ci.yml"), "utf8");
    expect(ci.includes("qlt-410-deploy")).toBe(true);
  });
});
