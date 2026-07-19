import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ApiError,
  apiRequest,
  buildApiUrl,
  clearHttpClientSessionHooks,
  HTTP_HEADERS,
  parseProblemPayload,
  resetSessionExpiredDedupe,
  setHttpClientSessionHooks,
} from "@/shared/api/http-client";
import {
  setObservabilityReporter,
  type ObservabilityReporter,
} from "@/shared/observability/reporter";
import { successEnvelopeSchema } from "@/shared/api/schemas";

const okSchema = successEnvelopeSchema(z.object({ ok: z.boolean() }));
const idSchema = successEnvelopeSchema(z.object({ id: z.string() }));
const listSchema = successEnvelopeSchema(z.array(z.object({ id: z.string() })));

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const envelope = (data: unknown, requestId = "req_meta") => ({
  data,
  meta: {
    requestId,
    timestamp: "2026-07-17T10:00:00Z",
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearHttpClientSessionHooks();
  resetSessionExpiredDedupe();
  setObservabilityReporter({
    captureError() {},
    captureMetric() {},
  });
});

describe("ApiError", () => {
  it("exposes structured problem details and helpers", () => {
    const error = new ApiError(422, {
      code: "VALIDATION_ERROR",
      message: "Invalid payload",
      requestId: "req_123",
      details: { fields: [{ field: "email", code: "INVALID" }] },
    }, 30);
    expect(error.status).toBe(422);
    expect(error.problem.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid payload");
    expect(error.name).toBe("ApiError");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.requestId).toBe("req_123");
    expect(error.retryAfterSeconds).toBe(30);
    expect(error.details).toEqual({
      fields: [{ field: "email", code: "INVALID" }],
    });
  });
});

describe("parseProblemPayload", () => {
  it("parses nested ProblemEnvelope", () => {
    expect(
      parseProblemPayload(
        {
          problem: {
            code: "VALIDATION_FAILED",
            message: "bad",
            requestId: "req_nested",
            details: { fields: [{ field: "x", code: "INVALID" }] },
          },
        },
        "fallback",
      ),
    ).toEqual({
      code: "VALIDATION_FAILED",
      message: "bad",
      requestId: "req_nested",
      details: { fields: [{ field: "x", code: "INVALID" }] },
    });
  });

  it("falls back to legacy top-level problem shape", () => {
    expect(
      parseProblemPayload(
        { code: "HTTP_ERROR", message: "legacy", requestId: "req_leg" },
        "fallback",
      ),
    ).toEqual({
      code: "HTTP_ERROR",
      message: "legacy",
      requestId: "req_leg",
      details: undefined,
    });
  });
});

describe("apiRequest", () => {
  it("serializes query parameters, JSON body, and contract headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope({ id: "p_1" })));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/products", {
      method: "POST",
      body: { name: "Prompt pack" },
      query: { page: 2, active: true, omitted: null },
      headers: { "X-Request-ID": "req_123" },
      requestId: "req_123",
      csrfToken: "csrf_123",
      idempotencyKey: "idem_123",
      auditReason: "manual retry",
      recentMfaProof: "mfa_123",
      ifMatch: '"rev-3"',
      schema: idSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // Node (vitest/SSR) resolves against API_INTERNAL_URL; browser stays relative.
    expect(String(url)).toMatch(/\/products\?page=2&active=true$/);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ name: "Prompt pack" }),
    });
    expect(init.headers).toBeInstanceOf(Headers);
    expect(init.headers.get(HTTP_HEADERS.ACCEPT)).toBe("application/json");
    expect(init.headers.get(HTTP_HEADERS.CONTENT_TYPE)).toBe(
      "application/json",
    );
    expect(init.headers.get(HTTP_HEADERS.REQUEST_ID)).toEqual(
      expect.any(String),
    );
    expect(init.headers.get(HTTP_HEADERS.CSRF)).toBe("csrf_123");
    expect(init.headers.get(HTTP_HEADERS.IDEMPOTENCY)).toBe("idem_123");
    expect(init.headers.get(HTTP_HEADERS.AUDIT_REASON)).toBe("manual retry");
    expect(init.headers.get(HTTP_HEADERS.RECENT_MFA_PROOF)).toBe("mfa_123");
    expect(init.headers.get(HTTP_HEADERS.IF_MATCH)).toBe('"rev-3"');
  });

  it("injects CSRF from session hooks for unsafe methods", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    setHttpClientSessionHooks({
      getCsrfToken: () => "hook_csrf",
    });

    await apiRequest("/v1/auth/logout", {
      method: "POST",
      schema: okSchema,
    });

    expect(fetchMock.mock.calls[0][1].headers.get(HTTP_HEADERS.CSRF)).toBe(
      "hook_csrf",
    );
  });

  it("does not inject CSRF for GET", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    setHttpClientSessionHooks({ getCsrfToken: () => "hook_csrf" });

    await apiRequest("/v1/auth/session", { schema: okSchema });

    expect(fetchMock.mock.calls[0][1].headers.get(HTTP_HEADERS.CSRF)).toBeNull();
  });

  it("generates a deterministic fallback request ID when UUID is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope({ ok: true })));
    vi.stubGlobal("crypto", { randomUUID: undefined });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/health", { schema: okSchema });

    expect(fetchMock.mock.calls[0][1].headers.get("X-Request-ID")).toMatch(
      /^web_req_[a-z0-9]+$/,
    );
  });

  it("returns parsed JSON for successful responses (envelope)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope({ ok: true }))),
    );

    await expect(
      apiRequest("/health", { schema: okSchema }),
    ).resolves.toEqual(envelope({ ok: true }));
  });

  it("returns list envelope data for success/list", async () => {
    const body = envelope([{ id: "a" }, { id: "b" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

    await expect(
      apiRequest("/items", { schema: listSchema }),
    ).resolves.toEqual(body);
  });

  it("returns undefined for a successful 204 response without schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(apiRequest<void>("/logout", { method: "POST" })).resolves.toBe(
      undefined,
    );
  });

  it("validates a successful response against the supplied schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope({ id: "p_1" }))),
    );

    await expect(
      apiRequest("/products/p_1", { schema: idSchema }),
    ).resolves.toEqual(envelope({ id: "p_1" }));
  });

  it("fails closed when schema is missing on non-204 success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope({ ok: true }))),
    );

    await expect(apiRequest("/health")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 502,
        problem: expect.objectContaining({ code: "INVALID_API_CONTRACT" }),
      }),
    );
  });

  it("allows requireSchema:false for transport-only tests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ raw: true })),
    );

    await expect(
      apiRequest("/health", { requireSchema: false }),
    ).resolves.toEqual({ raw: true });
  });

  it("reports an invalid response contract as an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope({ id: 42 }))),
    );

    await expect(
      apiRequest("/products/p_1", { schema: idSchema }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 502,
        problem: expect.objectContaining({ code: "INVALID_API_CONTRACT" }),
      }),
    );
  });

  it("converts nested ProblemEnvelope into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            problem: {
              code: "VALIDATION_FAILED",
              message: "Name is required",
              requestId: "req_1",
              details: { fields: [{ field: "name", code: "REQUIRED" }] },
            },
          },
          400,
        ),
      ),
    );

    await expect(
      apiRequest("/products", { method: "POST", requireSchema: false }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 400,
        problem: {
          code: "VALIDATION_FAILED",
          message: "Name is required",
          requestId: "req_1",
          details: { fields: [{ field: "name", code: "REQUIRED" }] },
        },
      }),
    );
  });

  it("prefers response X-Request-ID when problem omits requestId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            problem: {
              code: "RATE_LIMITED",
              message: "slow down",
            },
          },
          429,
          { "X-Request-ID": "resp_rid", "Retry-After": "12" },
        ),
      ),
    );

    const err = await apiRequest("/health", {
      requireSchema: false,
      requestId: "client_rid",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).problem.requestId).toBe("resp_rid");
    expect((err as ApiError).retryAfterSeconds).toBe(12);
  });

  it("uses a generic problem when an error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("upstream unavailable", { status: 503 }),
        ),
    );

    await expect(
      apiRequest("/health", { requireSchema: false }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 503,
        problem: {
          code: "HTTP_ERROR",
          message: "Request failed with status 503",
          requestId: expect.any(String),
        },
      }),
    );
  });

  it("rejects non-JSON content type on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await expect(
      apiRequest("/health", { requireSchema: false }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 502,
        problem: expect.objectContaining({ code: "INVALID_API_CONTRACT" }),
      }),
    );
  });

  it("propagates invalid JSON from an otherwise successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      apiRequest("/health", { requireSchema: false }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 502,
        problem: expect.objectContaining({ code: "INVALID_JSON_RESPONSE" }),
      }),
    );
  });

  it("aborts a request when the timeout elapses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest("/slow", {
      timeoutMs: 25,
      requireSchema: false,
    });
    const rejection = expect(request).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 408,
        problem: expect.objectContaining({ code: "REQUEST_TIMEOUT" }),
      }),
    );
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("honors an external AbortSignal over timeout", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        requestSignal = init.signal ?? undefined;
        return new Promise<never>((_, reject) => {
          if (init.signal?.aborted) {
            reject(new DOMException("The operation was aborted", "AbortError"));
            return;
          }
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted", "AbortError")),
          );
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const request = apiRequest("/cancelled", {
      signal: controller.signal,
      requireSchema: false,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(requestSignal).not.toBe(controller.signal);
    controller.abort();

    await expect(request).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 499,
        problem: expect.objectContaining({ code: "REQUEST_ABORTED" }),
      }),
    );
    expect(requestSignal?.aborted).toBe(true);
  });

  it("propagates network failures as NETWORK_ERROR", async () => {
    const networkError = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(
      apiRequest("/offline", { requireSchema: false }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 0,
        problem: expect.objectContaining({ code: "NETWORK_ERROR" }),
      }),
    );
  });

  it("dedupes session-expired 401 handler callbacks", async () => {
    const onSessionExpired = vi.fn();
    setHttpClientSessionHooks({ onSessionExpired });
    const problem = {
      problem: {
        code: "AUTH_SESSION_EXPIRED",
        message: "Session expired",
        requestId: "req_401",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(problem, 401)),
    );

    await Promise.all([
      apiRequest("/a", { requireSchema: false }).catch(() => undefined),
      apiRequest("/b", { requireSchema: false }).catch(() => undefined),
      apiRequest("/c", { requireSchema: false }).catch(() => undefined),
    ]);

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does not log request body or secrets in the reporter", async () => {
    const captureError = vi.fn();
    setObservabilityReporter({
      captureError,
      captureMetric() {},
    } satisfies ObservabilityReporter);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            problem: {
              code: "AUTH_INVALID_CREDENTIALS",
              message: "nope",
              requestId: "req_sec",
            },
          },
          401,
        ),
      ),
    );

    await apiRequest("/login", {
      method: "POST",
      body: { email: "a@b.c", password: "super-secret" },
      requireSchema: false,
    }).catch(() => undefined);

    expect(captureError).toHaveBeenCalled();
    const report = JSON.stringify(captureError.mock.calls[0][0]);
    expect(report).not.toMatch(/super-secret/);
    expect(report).not.toMatch(/password/);
    expect(report).toMatch(/req_sec|AUTH_INVALID_CREDENTIALS|http-client/);
  });

  it("builds same-origin relative URLs for browser topology", () => {
    // In Node (vitest), relative paths resolve against API_INTERNAL_URL so SSR can fetch.
    // Browser still uses relative `/v1` (covered when window is defined).
    const session = buildApiUrl("/v1/auth/session");
    const catalog = buildApiUrl("/v1/catalog", { page: 1 });
    if (typeof window === "undefined") {
      expect(String(session)).toMatch(/\/v1\/auth\/session$/);
      expect(String(catalog)).toMatch(/\/v1\/catalog\?page=1$/);
    } else {
      expect(session).toBe("/v1/auth/session");
      expect(catalog).toBe("/v1/catalog?page=1");
    }
  });

  it("resolves absolute internal URL on server when browser base is empty", () => {
    // SSR/prerender path: Node cannot fetch relative `/v1`.
    const url = buildApiUrl("/v1/public/products/featured", { limit: 6 });
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).pathname).toBe("/v1/public/products/featured");
    expect((url as URL).searchParams.get("limit")).toBe("6");
    expect((url as URL).origin).toMatch(/^https?:\/\//);
  });
});
