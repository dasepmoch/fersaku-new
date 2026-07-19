import { afterEach, describe, expect, it, vi } from "vitest";
import {
  redactContext,
  reportError,
  reportMetric,
  setObservabilityReporter,
} from "@/shared/observability/reporter";
import { resolveObservabilityMode } from "@/shared/observability/mode";
import {
  createMemorySink,
  createHttpSink,
} from "@/shared/observability/sink";
import { installObservabilityReporter } from "@/shared/observability/install";

let resetReporter: (() => void) | undefined;

afterEach(() => {
  resetReporter?.();
  resetReporter = undefined;
});

describe("observability redaction", () => {
  it("redacts sensitive keys recursively while preserving safe diagnostics", () => {
    const nested: Record<string, unknown> = {
      email: "buyer@example.test",
      token: "secret-token",
      safe: "visible",
      profile: { bankAccount: "123", plan: "pro" },
      list: [{ password: "pw" }, { value: 4 }],
    };
    nested.self = nested;

    expect(redactContext(nested)).toEqual({
      email: "[REDACTED]",
      token: "[REDACTED]",
      safe: "visible",
      profile: { bankAccount: "[REDACTED]", plan: "pro" },
      list: [{ password: "[REDACTED]" }, { value: 4 }],
      self: "[CIRCULAR]",
    });
  });

  it("redacts context before forwarding errors and metrics", () => {
    const reporter = {
      captureError: vi.fn(),
      captureMetric: vi.fn(),
    };
    resetReporter = setObservabilityReporter(reporter);
    const context = { requestId: "req_1", authorization: "Bearer secret" };

    reportError(new Error("boom"), context);
    reportMetric("checkout.completed", 1, context);

    expect(reporter.captureError).toHaveBeenCalledWith({
      error: expect.any(Error),
      context: expect.objectContaining({
        requestId: "req_1",
        authorization: "[REDACTED]",
      }),
      redactedError: expect.objectContaining({ name: "Error" }),
    });
    expect(reporter.captureMetric).toHaveBeenCalledWith({
      name: "checkout.completed",
      value: 1,
      context: expect.objectContaining({
        requestId: "req_1",
        authorization: "[REDACTED]",
      }),
    });
    expect(context).toEqual({
      requestId: "req_1",
      authorization: "Bearer secret",
    });
  });
});

describe("observability mode + sink install (GAP-07)", () => {
  it("resolves live stage to sink and explicit disabled", () => {
    expect(
      resolveObservabilityMode({ appStage: "live", nodeEnv: "production" }),
    ).toBe("sink");
    expect(
      resolveObservabilityMode({
        appStage: "live",
        reporter: "disabled",
      }),
    ).toBe("disabled");
    expect(
      resolveObservabilityMode({ appStage: "prototype", nodeEnv: "development" }),
    ).toBe("noop");
  });

  it("memory sink receives redacted error boundary style events", () => {
    const mem = createMemorySink();
    resetReporter = setObservabilityReporter(mem.reporter);
    reportError(new Error("boundary"), {
      source: "app-error-boundary",
      digest: "d1",
      token: "secret",
    });
    const events = mem.events();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("error");
    expect(events[0]?.context).toEqual(
      expect.objectContaining({
        source: "app-error-boundary",
        token: "[REDACTED]",
      }),
    );
  });

  it("installObservabilityReporter noop is explicit non-active", () => {
    const result = installObservabilityReporter({ mode: "noop" });
    resetReporter = result.uninstall;
    expect(result.active).toBe(false);
    expect(result.mode).toBe("noop");
  });

  it("http sink does not throw when fetch fails", async () => {
    const prev = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("down")) as typeof fetch;
    const sink = createHttpSink({ endpoint: "/api/observability/events" });
    expect(() =>
      sink.captureError({
        error: new Error("x"),
        redactedError: { name: "Error" },
        context: { requestId: "r" },
      }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    globalThis.fetch = prev;
  });
});
