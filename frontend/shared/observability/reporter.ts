/**
 * INT-170 — operator observability reporter.
 * Always redacts secrets; attaches releaseId / surface / operationId / requestId.
 * Schema/provider errors must never dump response bodies (callers pass codes only).
 */

import { redactContext, redactError, redactValue, isSensitiveKey } from "./redact";

export type ReportContext = Record<string, unknown>;

export type ErrorReport = {
  error: unknown;
  /** Redacted diagnostic bag for sinks. */
  context?: ReportContext;
  /** Redacted error tree (name/code/requestId/cause) — never raw body. */
  redactedError?: Record<string, unknown>;
};

export type MetricReport = {
  name: string;
  value: number;
  context?: ReportContext;
};

export type ObservabilityReporter = {
  captureError(report: ErrorReport): void;
  captureMetric(report: MetricReport): void;
};

export type TransportTelemetryFields = {
  releaseId?: string;
  surface?: string;
  operationId?: string;
  requestId?: string;
  status?: number;
  code?: string;
  routeTemplate?: string;
  phase?: string;
  kind?: string;
  source?: string;
};

export { redactContext, redactError, redactValue, isSensitiveKey };

const noopReporter: ObservabilityReporter = {
  captureError() {},
  captureMetric() {},
};

let activeReporter = noopReporter;

/** Deploy/release id for correlation (public, non-secret). */
let activeReleaseId: string | undefined =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_RELEASE_ID ||
      process.env.DOMAIN_SOURCE_RELEASE_ID ||
      undefined
    : undefined;

export function setObservabilityReporter(reporter: ObservabilityReporter) {
  activeReporter = reporter;
  return () => {
    activeReporter = noopReporter;
  };
}

export function setObservabilityReleaseId(releaseId: string | undefined) {
  activeReleaseId = releaseId;
}

export function getObservabilityReleaseId(): string | undefined {
  return activeReleaseId;
}

/**
 * Merge standard telemetry keys. Sensitive values are redacted before sink.
 * Prefer routeTemplate over raw path with resource IDs when available.
 */
export function buildTelemetryContext(
  fields: TransportTelemetryFields,
  extra?: ReportContext,
): ReportContext {
  const base: ReportContext = {
    releaseId: fields.releaseId ?? activeReleaseId,
    surface: fields.surface,
    operationId: fields.operationId,
    requestId: fields.requestId,
    status: fields.status,
    code: fields.code,
    routeTemplate: fields.routeTemplate,
    phase: fields.phase,
    kind: fields.kind,
    source: fields.source,
  };
  return redactContext({
    ...base,
    ...extra,
  });
}

function stripUndefined(ctx: ReportContext): ReportContext {
  const out: ReportContext = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function reportError(error: unknown, context?: ReportContext) {
  const redactedCtx = stripUndefined(
    redactContext({
      releaseId: activeReleaseId,
      ...context,
    }),
  );
  activeReporter.captureError({
    error,
    context: redactedCtx,
    redactedError: redactError(error),
  });
}

/**
 * Prefer this for transport/adapters: requestId always on the wire to telemetry.
 */
export function reportTransportError(
  error: unknown,
  fields: TransportTelemetryFields,
  extra?: ReportContext,
) {
  reportError(error, buildTelemetryContext(fields, extra));
}

export function reportMetric(
  name: string,
  value: number,
  context?: ReportContext,
) {
  const redactedCtx = stripUndefined(
    redactContext({
      releaseId: activeReleaseId,
      ...context,
    }),
  );
  activeReporter.captureMetric({
    name,
    value,
    context: redactedCtx,
  });
}

/**
 * Bounded-cardinality metric names (INT-170).
 * Callers must not interpolate free-form paths into the name.
 */
export const METRIC_NAMES = {
  latencyMs: "http.client.latency_ms",
  error: "http.client.error",
  retry: "http.client.retry",
  contractInvalid: "http.client.contract_invalid",
  sessionExpired: "http.client.session_expired",
} as const;

export function reportOperationMetric(
  name: (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES],
  value: number,
  fields: TransportTelemetryFields,
) {
  reportMetric(name, value, buildTelemetryContext(fields));
}
