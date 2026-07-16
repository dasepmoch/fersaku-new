export type ReportContext = Record<string, unknown>;

export type ErrorReport = {
  error: unknown;
  context?: ReportContext;
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

const SENSITIVE_KEY =
  /email|token|secret|password|credential|account|bank|qris|authorization/i;

function redactValue(
  value: unknown,
  key: string,
  seen: WeakSet<object>,
): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, "item", seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactValue(childValue, childKey, seen),
    ]),
  );
}

export function redactContext(context: ReportContext = {}): ReportContext {
  const seen = new WeakSet<object>();
  seen.add(context);
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      redactValue(value, key, seen),
    ]),
  );
}

const noopReporter: ObservabilityReporter = {
  captureError() {},
  captureMetric() {},
};

let activeReporter = noopReporter;

export function setObservabilityReporter(reporter: ObservabilityReporter) {
  activeReporter = reporter;
  return () => {
    activeReporter = noopReporter;
  };
}

export function reportError(error: unknown, context?: ReportContext) {
  activeReporter.captureError({
    error,
    context: redactContext(context),
  });
}

export function reportMetric(
  name: string,
  value: number,
  context?: ReportContext,
) {
  activeReporter.captureMetric({
    name,
    value,
    context: redactContext(context),
  });
}
