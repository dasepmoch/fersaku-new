import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import {
  operatorErrorTelemetry,
  presentClassifiedError,
  presentThrownError,
} from "@/shared/api/error-presentation";
import {
  classifyApiError,
  mustNotTreatAsEmpty,
  rejectAsApiFailure,
} from "@/shared/api/error-policy";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  type DomainSourceSnapshot,
} from "@/shared/data/domain-source";
import {
  isMockInteractionFeedbackEnabled,
  mockInteractionFeedbackMessage,
} from "@/shared/data/mock-interaction";
import {
  isSensitiveKey,
  redactContext,
  redactError,
  redactValue,
  REDACTED,
  CIRCULAR,
} from "@/shared/observability/redact";
import {
  buildTelemetryContext,
  METRIC_NAMES,
  reportError,
  reportMetric,
  reportTransportError,
  setObservabilityReleaseId,
  setObservabilityReporter,
} from "@/shared/observability/reporter";

function mockSnapshot(
  mode: "all-mock" | "all-api" | "mixed",
  stage: "prototype" | "live" = "prototype",
): DomainSourceSnapshot {
  if (mode === "mixed") {
    return {
      version: "int-170-test",
      releaseId: "rel_test",
      stage,
      domains: {
        publicCatalog: "mock",
        auth: "api",
        checkout: "api",
        buyer: "api",
        sellerCatalog: "api",
        sellerOperations: "api",
        sellerFinance: "api",
        adminRead: "api",
        adminWrite: "api",
      },
    };
  }
  const source = mode === "all-mock" ? "mock" : "api";
  return {
    version: "int-170-test",
    releaseId: "rel_test",
    stage,
    domains: {
      publicCatalog: source,
      auth: source,
      checkout: source,
      buyer: source,
      sellerCatalog: source,
      sellerOperations: source,
      sellerFinance: source,
      adminRead: source,
      adminWrite: source,
    },
  };
}

let resetReporter: (() => void) | undefined;

afterEach(() => {
  resetReporter?.();
  resetReporter = undefined;
  clearDomainSourceSnapshot();
  setObservabilityReleaseId(undefined);
});

describe("INT-170 mock interaction boundary", () => {
  it("enables mock feedback only for pure-mock prototype", () => {
    installDomainSourceSnapshot(mockSnapshot("all-mock"));
    expect(isMockInteractionFeedbackEnabled()).toBe(true);
  });

  it("disables mock feedback when any domain is api", () => {
    installDomainSourceSnapshot(mockSnapshot("all-api"));
    expect(isMockInteractionFeedbackEnabled()).toBe(false);

    installDomainSourceSnapshot(mockSnapshot("mixed"));
    expect(isMockInteractionFeedbackEnabled()).toBe(false);
  });

  it("disables mock feedback on live stage", () => {
    // live + mock is invalid for evaluation; install snapshot with api
    installDomainSourceSnapshot(mockSnapshot("all-api", "live"));
    expect(isMockInteractionFeedbackEnabled()).toBe(false);
  });

  it("preserves existing mock feedback copy", () => {
    expect(mockInteractionFeedbackMessage("Simpan")).toBe(
      "Simpan diproses dalam mode mock.",
    );
  });
});

describe("INT-170 recursive redaction", () => {
  it("redacts nested objects, arrays, and circular refs", () => {
    const nested: Record<string, unknown> = {
      email: "buyer@example.test",
      phone: "+62812",
      token: "secret-token",
      csrfToken: "csrf-x",
      mfaProof: "mfa-y",
      authorization: "Bearer abc",
      cookie: "session=abc",
      apiKey: "key_1",
      qrisPayload: "00020101",
      bankAccount: "123456",
      signedUrl: "https://signed.example/obj?sig=1",
      inventorySecret: "inv-secret",
      deliverySecret: "del-secret",
      safe: "visible",
      profile: {
        email: "nested@example.test",
        plan: "pro",
        credentials: { password: "pw", ok: true },
      },
      list: [
        { refreshToken: "r1" },
        { value: 4, otp: "123456" },
        [{ privateKey: "pk" }],
      ],
    };
    nested.self = nested;

    expect(redactContext(nested)).toEqual({
      email: REDACTED,
      phone: REDACTED,
      token: REDACTED,
      csrfToken: REDACTED,
      mfaProof: REDACTED,
      authorization: REDACTED,
      cookie: REDACTED,
      apiKey: REDACTED,
      qrisPayload: REDACTED,
      bankAccount: REDACTED,
      signedUrl: REDACTED,
      inventorySecret: REDACTED,
      deliverySecret: REDACTED,
      safe: "visible",
      profile: {
        email: REDACTED,
        plan: "pro",
        // key "credentials" is sensitive (matches credential*)
        credentials: REDACTED,
      },
      list: [
        { refreshToken: REDACTED },
        { value: 4, otp: REDACTED },
        [{ privateKey: REDACTED }],
      ],
      self: CIRCULAR,
    });
  });

  it("redacts Error cause chains without dumping response bodies", () => {
    const root = new Error("outer Bearer sk_live_abc");
    const mid = new Error("mid token=leaked");
    const leaf = new Error("leaf");
    (mid as Error & { cause?: unknown }).cause = leaf;
    (root as Error & { cause?: unknown }).cause = mid;

    const api = new ApiError(502, {
      code: PROBLEM_CODES.INVALID_API_CONTRACT,
      message: "contract failed for user@secret.test",
      requestId: "req_contract_1",
      details: {
        responseBody: { raw: "SHOULD_NOT_APPEAR_IN_REDACT_ERROR" },
        issues: [{ path: "data", message: "required" }],
      },
    });
    (leaf as Error & { cause?: unknown }).cause = api;

    const redacted = redactError(root);
    const serialized = JSON.stringify(redacted);

    expect(redacted.requestId).toBeUndefined();
    expect(serialized).not.toContain("sk_live_abc");
    expect(serialized).not.toContain("SHOULD_NOT_APPEAR");
    expect(serialized).not.toContain("user@secret.test");
    expect(serialized).toContain("req_contract_1");
    expect(serialized).toContain(PROBLEM_CODES.INVALID_API_CONTRACT);
    expect(redacted.cause).toMatchObject({
      name: "Error",
      cause: {
        name: "Error",
        cause: {
          name: "ApiError",
          code: PROBLEM_CODES.INVALID_API_CONTRACT,
          requestId: "req_contract_1",
        },
      },
    });
  });

  it("marks sensitive keys correctly", () => {
    expect(isSensitiveKey("Authorization")).toBe(true);
    expect(isSensitiveKey("X-CSRF-Token")).toBe(true);
    expect(isSensitiveKey("requestId")).toBe(false);
    expect(isSensitiveKey("status")).toBe(false);
  });

  it("redactValue handles nested arrays of objects", () => {
    expect(
      redactValue({
        rows: [[{ csrf: "x" }, { ok: 1 }], { token: "y" }],
      }),
    ).toEqual({
      rows: [[{ csrf: REDACTED }, { ok: 1 }], { token: REDACTED }],
    });
  });
});

describe("INT-170 reporter wiring", () => {
  it("forwards redacted context, releaseId, requestId, and redactedError", () => {
    const reporter = {
      captureError: vi.fn(),
      captureMetric: vi.fn(),
    };
    resetReporter = setObservabilityReporter(reporter);
    setObservabilityReleaseId("rel_170");

    const err = new ApiError(500, {
      code: PROBLEM_CODES.INTERNAL_ERROR,
      message: "boom",
      requestId: "req_op_1",
    });

    reportTransportError(err, {
      surface: "seller",
      operationId: "listSellerOrders",
      requestId: "req_op_1",
      status: 500,
      code: PROBLEM_CODES.INTERNAL_ERROR,
      routeTemplate: "/v1/stores/{str}/orders",
      phase: "http_error",
      source: "http-client",
    }, { authorization: "Bearer secret", cookie: "a=b" });

    expect(reporter.captureError).toHaveBeenCalledTimes(1);
    const report = reporter.captureError.mock.calls[0][0];
    expect(report.context).toMatchObject({
      releaseId: "rel_170",
      surface: "seller",
      operationId: "listSellerOrders",
      requestId: "req_op_1",
      status: 500,
      code: PROBLEM_CODES.INTERNAL_ERROR,
      routeTemplate: "/v1/stores/{str}/orders",
      phase: "http_error",
      source: "http-client",
      authorization: REDACTED,
      cookie: REDACTED,
    });
    expect(report.redactedError).toMatchObject({
      name: "ApiError",
      code: PROBLEM_CODES.INTERNAL_ERROR,
      requestId: "req_op_1",
    });
    expect(JSON.stringify(report.context)).not.toContain("Bearer secret");
  });

  it("buildTelemetryContext redacts and preserves requestId", () => {
    setObservabilityReleaseId("rel_x");
    expect(
      buildTelemetryContext({
        requestId: "req_2",
        code: "X",
      }, { apiKey: "k" }),
    ).toMatchObject({
      releaseId: "rel_x",
      requestId: "req_2",
      code: "X",
      apiKey: REDACTED,
    });
  });

  it("exports bounded metric names", () => {
    expect(METRIC_NAMES.contractInvalid).toBe("http.client.contract_invalid");
    expect(METRIC_NAMES.sessionExpired).toBe("http.client.session_expired");
  });

  it("reportError / reportMetric redact before sink", () => {
    const reporter = {
      captureError: vi.fn(),
      captureMetric: vi.fn(),
    };
    resetReporter = setObservabilityReporter(reporter);
    reportError(new Error("e"), { token: "t", requestId: "r1" });
    reportMetric("m", 1, { csrf: "c", requestId: "r1" });
    expect(reporter.captureError.mock.calls[0][0].context).toMatchObject({
      token: REDACTED,
      requestId: "r1",
    });
    expect(reporter.captureMetric.mock.calls[0][0].context).toMatchObject({
      csrf: REDACTED,
      requestId: "r1",
    });
  });
});

describe("INT-170 error presentation", () => {
  it("maps classified errors to existing lifecycle surfaces without requestId UI", () => {
    const classified = classifyApiError(401, {
      code: PROBLEM_CODES.AUTH_REQUIRED,
      message: "Session expired",
      requestId: "req_ui_1",
    });
    const presented = presentClassifiedError(classified);
    expect(presented.surface).toBe("session_login");
    expect(presented.requestId).toBe("req_ui_1");
    expect(presented.showRequestIdToUser).toBe(false);
    expect(presented.mustNotTreatAsEmpty).toBe(true);
    expect(presented.userMessage).toBe("Session expired");
    expect(presented.userMessage).not.toContain("req_ui_1");
  });

  it("operator telemetry includes requestId and never forces user-visible support copy", () => {
    const presented = presentThrownError(
      new ApiError(502, {
        code: PROBLEM_CODES.INVALID_API_CONTRACT,
        message: "bad contract",
        requestId: "req_tel_1",
      }),
    );
    const tel = operatorErrorTelemetry(presented, {
      releaseId: "rel",
      operationId: "getProduct",
      routeTemplate: "/v1/public/products/{id}",
      surface: "public",
    });
    expect(tel.requestId).toBe("req_tel_1");
    expect(tel.operationId).toBe("getProduct");
    expect(presented.showRequestIdToUser).toBe(false);
  });
});

describe("INT-170 no silent mock fallback on API errors", () => {
  it("mustNotTreatAsEmpty is always true for transport failures", () => {
    const network = new ApiError(0, {
      code: PROBLEM_CODES.NETWORK_ERROR,
      message: "down",
      requestId: "req_n",
    });
    const contract = new ApiError(502, {
      code: PROBLEM_CODES.INVALID_API_CONTRACT,
      message: "schema",
      requestId: "req_c",
    });
    expect(mustNotTreatAsEmpty(network)).toBe(true);
    expect(mustNotTreatAsEmpty(contract)).toBe(true);
  });

  it("rejectAsApiFailure never yields empty list / mock success", () => {
    expect(() =>
      rejectAsApiFailure(
        new ApiError(500, {
          code: PROBLEM_CODES.INTERNAL_ERROR,
          message: "fail",
          requestId: "req_r",
        }),
      ),
    ).toThrow(ApiError);
  });

  it("document: shouldUseMockFixtures is a mode gate, not a catch fallback", async () => {
    // Import a representative adapter and assert source structure:
    // mock branch is only the mode gate before transport, never catch→fixture.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "../..");
    const adapters = [
      "features/catalog/api.ts",
      "features/orders/api.ts",
      "features/finance/api.ts",
      "features/buyer/data/api.ts",
      "features/commerce/checkout/api.ts",
    ];
    for (const rel of adapters) {
      const content = fs.readFileSync(path.join(root, rel), "utf8");
      // No catch that returns demo/fixture after apiRequest
      expect(content).not.toMatch(
        /catch\s*\([^)]*\)\s*\{[\s\S]*?return\s+(demo|mock)/,
      );
      expect(content).not.toMatch(
        /catch\s*\([^)]*\)\s*\{[\s\S]*?shouldUseMockFixtures/,
      );
      // Mode gate is pre-call only
      if (content.includes("apiRequest")) {
        expect(content).toMatch(/shouldUseMockFixtures/);
      }
    }
  });
});
