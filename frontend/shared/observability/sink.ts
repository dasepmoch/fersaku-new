/**
 * GAP-07 — real observability sinks (redacted events only).
 * Never attach cookies, tokens, payment/KYC payloads, or raw headers.
 */

import type {
  ErrorReport,
  MetricReport,
  ObservabilityReporter,
} from "./reporter";

export type SinkEvent = {
  kind: "error" | "metric";
  ts: string;
  releaseId?: string;
  surface?: string;
  /** Redacted error tree */
  redactedError?: Record<string, unknown>;
  context?: Record<string, unknown>;
  metric?: { name: string; value: number };
  source?: string;
};

const MAX_BUFFER = 50;
const FLUSH_MS = 2000;

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

/**
 * Memory sink for tests and diagnostics (bounded ring buffer).
 */
export function createMemorySink(limit = MAX_BUFFER): {
  reporter: ObservabilityReporter;
  events: () => SinkEvent[];
  clear: () => void;
} {
  const buf: SinkEvent[] = [];
  const push = (e: SinkEvent) => {
    buf.push(e);
    if (buf.length > limit) buf.shift();
  };
  return {
    events: () => buf.slice(),
    clear: () => {
      buf.length = 0;
    },
    reporter: {
      captureError(report: ErrorReport) {
        push({
          kind: "error",
          ts: new Date().toISOString(),
          redactedError: report.redactedError,
          context: report.context as Record<string, unknown> | undefined,
          releaseId:
            typeof report.context?.releaseId === "string"
              ? report.context.releaseId
              : undefined,
          surface:
            typeof report.context?.surface === "string"
              ? report.context.surface
              : undefined,
          source:
            typeof report.context?.source === "string"
              ? report.context.source
              : undefined,
        });
      },
      captureMetric(report: MetricReport) {
        push({
          kind: "metric",
          ts: new Date().toISOString(),
          metric: { name: report.name, value: report.value },
          context: report.context as Record<string, unknown> | undefined,
          releaseId:
            typeof report.context?.releaseId === "string"
              ? report.context.releaseId
              : undefined,
        });
      },
    },
  };
}

/**
 * Console sink — structured JSON lines (local/staging diagnostics).
 * Does not print raw Error stacks with request bodies (uses redactedError).
 */
export function createConsoleSink(): ObservabilityReporter {
  return {
    captureError(report: ErrorReport) {
      const payload: SinkEvent = {
        kind: "error",
        ts: new Date().toISOString(),
        redactedError: report.redactedError,
        context: report.context as Record<string, unknown> | undefined,
      };
      // eslint-disable-next-line no-console
      console.error("[observability]", safeJson(payload));
    },
    captureMetric(report: MetricReport) {
      const payload: SinkEvent = {
        kind: "metric",
        ts: new Date().toISOString(),
        metric: { name: report.name, value: report.value },
        context: report.context as Record<string, unknown> | undefined,
      };
      // eslint-disable-next-line no-console
      console.info("[observability]", safeJson(payload));
    },
  };
}

export type HttpSinkOptions = {
  /** Same-origin intake path (default /api/observability/events). */
  endpoint?: string;
  /** Max events before drop (oldest). */
  bufferLimit?: number;
};

/**
 * Batched HTTP sink — POSTs redacted events to a same-origin intake.
 * Uses sendBeacon when available; never blocks UI. Drops on full buffer.
 */
export function createHttpSink(
  options: HttpSinkOptions = {},
): ObservabilityReporter {
  const endpoint = options.endpoint || "/api/observability/events";
  const limit = options.bufferLimit ?? MAX_BUFFER;
  let queue: SinkEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, FLUSH_MS);
  };

  const enqueue = (e: SinkEvent) => {
    queue.push(e);
    if (queue.length > limit) {
      queue = queue.slice(queue.length - limit);
    }
    schedule();
  };

  const flush = async () => {
    if (flushing || queue.length === 0) return;
    flushing = true;
    const batch = queue;
    queue = [];
    const body = safeJson({ events: batch });
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        const blob = new Blob([body], { type: "application/json" });
        const ok = navigator.sendBeacon(endpoint, blob);
        if (!ok && typeof fetch === "function") {
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
            credentials: "same-origin",
          });
        }
      } else if (typeof fetch === "function") {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
          credentials: "same-origin",
        });
      }
    } catch {
      // Exporter outage must not throw into app error boundaries.
    } finally {
      flushing = false;
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
    window.addEventListener("pagehide", () => {
      void flush();
    });
  }

  return {
    captureError(report: ErrorReport) {
      enqueue({
        kind: "error",
        ts: new Date().toISOString(),
        redactedError: report.redactedError,
        context: report.context as Record<string, unknown> | undefined,
        releaseId:
          typeof report.context?.releaseId === "string"
            ? report.context.releaseId
            : undefined,
        surface:
          typeof report.context?.surface === "string"
            ? report.context.surface
            : undefined,
        source:
          typeof report.context?.source === "string"
            ? report.context.source
            : undefined,
      });
    },
    captureMetric(report: MetricReport) {
      enqueue({
        kind: "metric",
        ts: new Date().toISOString(),
        metric: { name: report.name, value: report.value },
        context: report.context as Record<string, unknown> | undefined,
        releaseId:
          typeof report.context?.releaseId === "string"
            ? report.context.releaseId
            : undefined,
      });
    },
  };
}

/** Fan-out reporter. */
export function composeReporters(
  ...reporters: ObservabilityReporter[]
): ObservabilityReporter {
  return {
    captureError(report) {
      for (const r of reporters) {
        try {
          r.captureError(report);
        } catch {
          /* ignore sink errors */
        }
      }
    },
    captureMetric(report) {
      for (const r of reporters) {
        try {
          r.captureMetric(report);
        } catch {
          /* ignore */
        }
      }
    },
  };
}
