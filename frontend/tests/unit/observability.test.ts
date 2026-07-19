import { afterEach, describe, expect, it, vi } from "vitest";
import {
  redactContext,
  reportError,
  reportMetric,
  setObservabilityReporter,
} from "@/shared/observability/reporter";

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
