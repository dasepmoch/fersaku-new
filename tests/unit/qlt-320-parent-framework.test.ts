import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QLT-320 parent framework asserts (not full observability/alert/runbook cells).
 * Failures here mean harness/registration/policy regressions, not domain cells.
 */

const root = process.cwd();

const MATRIX_CATEGORIES = [
  "Structured signals",
  "Alerts",
  "Dashboards",
  "Runbooks",
] as const;

const REQUIRED_SAMPLES = [
  "shared/observability/reporter.ts",
  "shared/observability/redact.ts",
  "shared/api/http-client.ts",
  "shared/api/server-http-client.ts",
  "tests/unit/observability.test.ts",
  "tests/unit/int-170-error-mock-observability.test.ts",
  "backend/docs/observability-log-fields.md",
  "backend/internal/platform/metrics/metrics.go",
  "backend/docs/slo.md",
  "backend/docs/dashboards/launch-overview.md",
  "backend/docs/dashboards/launch-overview.json",
] as const;

const RUNBOOK_SAMPLES = [
  "backend/docs/runbooks/incident-diagnosis.md",
  "backend/docs/runbooks/callback-failure.md",
  "backend/docs/runbooks/queue-outbox.md",
  "backend/docs/runbooks/r2-email-health.md",
  "backend/docs/runbooks/backup-restore-integrity.md",
  "backend/docs/runbooks/sandbox-qris-synthetic.md",
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

describe("QLT-320 parent — co-evolution + category registration", () => {
  it("co-evolution doc exists and registers four matrix categories", () => {
    const rel = "docs/QLT-320-OBSERVABILITY-COEVOLUTION.md";
    minBytes(rel, 2000);
    const src = readFileSync(abs(rel), "utf8");

    for (const cat of MATRIX_CATEGORIES) {
      expect(src.includes(cat), `category registered: ${cat}`).toBe(true);
    }

    for (const needle of [
      "co-evolution",
      "capability cell",
      "qlt-320-observability",
      "requestId",
      "same PR",
      "Do not invent",
      "Parent",
      "runbook",
    ]) {
      expect(
        src.toLowerCase().includes(needle.toLowerCase()),
        `co-evolution marker: ${needle}`,
      ).toBe(true);
    }
  });

  it("parent does not claim full §3.7 cells or invent alert/game-day results", () => {
    const src = readFileSync(
      abs("docs/QLT-320-OBSERVABILITY-COEVOLUTION.md"),
      "utf8",
    );
    expect(src.includes("§3.7") || src.includes("3.7")).toBe(true);
    expect(
      src.toLowerCase().includes("game-day") ||
        src.toLowerCase().includes("alert firings"),
    ).toBe(true);
    expect(src.includes("Not") || src.includes("does **not**")).toBe(true);
  });
});

describe("QLT-320 parent — required non-empty samples", () => {
  it("FE reporter/redaction, requestId, BE metrics, dashboard, SLO samples are present", () => {
    for (const rel of REQUIRED_SAMPLES) {
      minBytes(rel, 200);
    }
  });

  it("FE reporter attaches releaseId/surface/operationId/requestId and redacts", () => {
    const reporter = readFileSync(
      abs("shared/observability/reporter.ts"),
      "utf8",
    );
    for (const needle of [
      "buildTelemetryContext",
      "reportTransportError",
      "requestId",
      "releaseId",
      "surface",
      "operationId",
      "redactContext",
      "METRIC_NAMES",
    ]) {
      expect(reporter.includes(needle), `reporter: ${needle}`).toBe(true);
    }

    const redact = readFileSync(abs("shared/observability/redact.ts"), "utf8");
    for (const needle of [
      "SENSITIVE_KEY_PATTERN",
      "redactContext",
      "redactError",
      "REDACTED",
    ]) {
      expect(redact.includes(needle), `redact: ${needle}`).toBe(true);
    }
  });

  it("requestId propagation samples exist on browser and SSR clients", () => {
    const browser = readFileSync(abs("shared/api/http-client.ts"), "utf8");
    for (const needle of [
      "REQUEST_ID",
      "requestId",
      "createRequestId",
      "reportTransportError",
    ]) {
      expect(browser.includes(needle), `http-client: ${needle}`).toBe(true);
    }

    const ssr = readFileSync(abs("shared/api/server-http-client.ts"), "utf8");
    for (const needle of ["REQUEST_ID", "requestId"]) {
      expect(ssr.includes(needle), `server-http-client: ${needle}`).toBe(true);
    }
  });

  it("BE metrics registry exposes low-cardinality fersaku series", () => {
    const metrics = readFileSync(
      abs("backend/internal/platform/metrics/metrics.go"),
      "utf8",
    );
    for (const needle of [
      "fersaku_http_requests_total",
      "fersaku_payment_paid_total",
      "fersaku_callback_processed_total",
      "fersaku_webhook_delivery_total",
      "fersaku_outbox_pending",
      "low-cardinality",
    ]) {
      expect(metrics.includes(needle), `metrics.go: ${needle}`).toBe(true);
    }
  });

  it("runbook index is non-empty with required diagnosis/callback/outbox samples", () => {
    const dir = abs("backend/docs/runbooks");
    expect(existsSync(dir), "runbooks dir").toBe(true);
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length, "runbook count").toBeGreaterThanOrEqual(4);

    for (const rel of RUNBOOK_SAMPLES) {
      minBytes(rel, 200);
    }

    const diagnosis = readFileSync(
      abs("backend/docs/runbooks/incident-diagnosis.md"),
      "utf8",
    );
    for (const needle of ["request_id", "trace_id", "no secrets"]) {
      expect(
        diagnosis.toLowerCase().includes(needle.toLowerCase()),
        `incident-diagnosis: ${needle}`,
      ).toBe(true);
    }
  });

  it("SLO doc registers alert content without inventing firings", () => {
    const slo = readFileSync(abs("backend/docs/slo.md"), "utf8");
    for (const needle of [
      "Initial alert",
      "runbook",
      "request_id",
      "Do not invent",
    ]) {
      expect(
        slo.toLowerCase().includes(needle.toLowerCase()),
        `slo.md: ${needle}`,
      ).toBe(true);
    }
  });
});

describe("QLT-320 parent — CI suite registration", () => {
  it("ci-assert-suite registers qlt-320-observability", () => {
    const src = readFileSync(abs("scripts/ci-assert-suite.mjs"), "utf8");
    expect(src.includes('case "qlt-320-observability"')).toBe(true);
    expect(src.includes("QLT-320-OBSERVABILITY-COEVOLUTION")).toBe(true);
  });

  it("package.json and CI wire observability asserts", () => {
    const pkg = readFileSync(abs("package.json"), "utf8");
    expect(pkg.includes("ci:assert:observability")).toBe(true);
    expect(pkg.includes("qlt-320-observability")).toBe(true);

    const ci = readFileSync(abs(".github/workflows/ci.yml"), "utf8");
    expect(ci.includes("qlt-320-observability")).toBe(true);
  });
});
