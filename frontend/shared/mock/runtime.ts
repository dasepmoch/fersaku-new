import { publicEnv } from "@/shared/config/env";

export type MockScenario =
  "default" | "empty" | "loading-slow" | "error" | "unauthorized";

export type MockRuntimeOptions = {
  scenario?: MockScenario | string;
  now?: string;
  latencyMs?: number;
  seed?: number;
};

const DEFAULT_NOW = "2026-07-16T12:00:00+07:00";

export class MockScenarioError extends Error {
  constructor(
    public readonly code: "MOCK_ERROR" | "MOCK_UNAUTHORIZED",
    message: string,
  ) {
    super(message);
    this.name = "MockScenarioError";
  }
}

export function abortableDelay(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }
    let settled = false;
    let abort = () => {};
    const timeout = setTimeout(() => {
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason || new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function createMockRuntime(options: MockRuntimeOptions = {}) {
  const scenario = options.scenario || publicEnv.mockScenario;
  const now = options.now || DEFAULT_NOW;
  const baseLatency =
    options.latencyMs ?? (scenario === "loading-slow" ? 1_200 : 0);
  let sequence = options.seed ?? 0;

  return {
    scenario,
    now: () => now,
    nextId(prefix: string) {
      sequence += 1;
      return `${prefix}_${sequence.toString(36).padStart(4, "0")}`;
    },
    reset(nextSeed = options.seed ?? 0) {
      sequence = nextSeed;
    },
    async wait(signal?: AbortSignal, latencyMs = baseLatency) {
      await abortableDelay(latencyMs, signal);
      if (scenario === "error") {
        throw new MockScenarioError(
          "MOCK_ERROR",
          "The selected mock scenario simulates a service error.",
        );
      }
      if (scenario === "unauthorized") {
        throw new MockScenarioError(
          "MOCK_UNAUTHORIZED",
          "The selected mock scenario simulates an unauthorized session.",
        );
      }
    },
    list<T>(items: readonly T[]): T[] {
      return scenario === "empty" ? [] : [...items];
    },
  };
}

export const mockRuntime = createMockRuntime();
