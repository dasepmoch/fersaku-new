/**
 * GAP-07 — install process observability reporter at bootstrap.
 * Call once from client root (and optionally server diagnostics).
 */

import {
  setObservabilityReleaseId,
  setObservabilityReporter,
  type ObservabilityReporter,
} from "./reporter";
import {
  composeReporters,
  createConsoleSink,
  createHttpSink,
  createMemorySink,
} from "./sink";
import {
  readObservabilityModeFromProcess,
  type ObservabilityMode,
} from "./mode";

export type InstallResult = {
  mode: ObservabilityMode;
  /** True when a non-noop sink is active. */
  active: boolean;
  uninstall: () => void;
};

let installedMode: ObservabilityMode | undefined;
let memoryEvents: (() => ReturnType<
  ReturnType<typeof createMemorySink>["events"]
>) | null = null;

/**
 * Install the production/staging sink or explicit noop.
 * Idempotent for the current mode; re-install replaces reporter.
 */
export function installObservabilityReporter(options?: {
  mode?: ObservabilityMode;
  /** Include console sink (default true for non-production node). */
  console?: boolean;
  /** Include HTTP intake (default true when mode=sink and browser). */
  http?: boolean;
  /** Include memory ring for diagnostics (default true when sink). */
  memory?: boolean;
}): InstallResult {
  const mode = options?.mode ?? readObservabilityModeFromProcess();
  installedMode = mode;

  if (mode === "noop" || mode === "disabled") {
    const uninstall = setObservabilityReporter({
      captureError() {},
      captureMetric() {},
    });
    memoryEvents = null;
    return { mode, active: false, uninstall };
  }

  const parts: ObservabilityReporter[] = [];
  const useConsole =
    options?.console ??
    (typeof process !== "undefined" && process.env.NODE_ENV !== "production");
  if (useConsole) {
    parts.push(createConsoleSink());
  }
  const useHttp =
    options?.http ??
    (typeof window !== "undefined" ||
      (typeof process !== "undefined" && process.env.NODE_ENV === "production"));
  if (useHttp) {
    parts.push(createHttpSink());
  }
  const useMemory = options?.memory ?? true;
  if (useMemory) {
    const mem = createMemorySink();
    memoryEvents = mem.events;
    parts.push(mem.reporter);
  }

  if (parts.length === 0) {
    parts.push(createConsoleSink());
  }

  const releaseId =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_RELEASE_ID ||
        process.env.RELEASE_ID ||
        undefined
      : undefined;
  if (releaseId) {
    setObservabilityReleaseId(releaseId);
  }

  const uninstall = setObservabilityReporter(composeReporters(...parts));
  return { mode, active: true, uninstall };
}

export function getInstalledObservabilityMode(): ObservabilityMode | undefined {
  return installedMode ?? readObservabilityModeFromProcess();
}

/** Diagnostics snapshot (redacted events only). */
export function getObservabilityDiagnostics(): {
  mode: ObservabilityMode;
  active: boolean;
  recentEventCount: number;
} {
  const mode = getInstalledObservabilityMode() ?? "noop";
  const events = memoryEvents?.() ?? [];
  return {
    mode,
    active: mode === "sink",
    recentEventCount: events.length,
  };
}
