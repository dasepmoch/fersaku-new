/**
 * GAP-07 — observability reporter mode (explicit, visible in diagnostics).
 *
 * - sink: production/staging default when live stage — real sink installed
 * - noop: local/test or explicit NEXT_PUBLIC_OBSERVABILITY_REPORTER=noop|disabled
 * - disabled: same as noop but marked for readiness/diagnostics
 */

export type ObservabilityMode = "sink" | "noop" | "disabled";

export function resolveObservabilityMode(env: {
  nodeEnv?: string;
  appStage?: string;
  reporter?: string;
  vitest?: boolean;
}): ObservabilityMode {
  const explicit = (env.reporter || "").trim().toLowerCase();
  if (explicit === "disabled" || explicit === "off" || explicit === "0") {
    return "disabled";
  }
  if (explicit === "noop") {
    return "noop";
  }
  if (explicit === "sink" || explicit === "on" || explicit === "1") {
    return "sink";
  }
  // Auto: live stage → sink; vitest/test → noop; development → noop unless forced.
  if (env.vitest || env.nodeEnv === "test") {
    return "noop";
  }
  if (env.appStage === "live") {
    return "sink";
  }
  return "noop";
}

export function readObservabilityModeFromProcess(): ObservabilityMode {
  return resolveObservabilityMode({
    nodeEnv: process.env.NODE_ENV,
    appStage: process.env.NEXT_PUBLIC_APP_STAGE,
    reporter: process.env.NEXT_PUBLIC_OBSERVABILITY_REPORTER,
    vitest: process.env.VITEST === "true" || process.env.NODE_ENV === "test",
  });
}
