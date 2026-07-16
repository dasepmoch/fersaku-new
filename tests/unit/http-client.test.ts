import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiRequest } from "@/shared/api/http-client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ApiError", () => {
  it("exposes structured problem details", () => {
    const error = new ApiError(422, {
      code: "VALIDATION_ERROR",
      message: "Invalid payload",
      requestId: "req_123",
    });
    expect(error.status).toBe(422);
    expect(error.problem.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid payload");
    expect(error.name).toBe("ApiError");
  });
});

describe("apiRequest", () => {
  it("serializes query parameters, JSON body, and request headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "p_1" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest<{ id: string }, { name: string }>("/products", {
      method: "POST",
      body: { name: "Prompt pack" },
      query: { page: 2, active: true, omitted: null },
      headers: { "X-Request-ID": "req_123" },
      requestId: "req_123",
      csrfToken: "csrf_123",
      idempotencyKey: "idem_123",
      auditReason: "manual retry",
      recentMfaProof: "mfa_123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:8080/products?page=2&active=true",
    );
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ name: "Prompt pack" }),
    });
    expect(init.headers).toBeInstanceOf(Headers);
    expect(init.headers.get("Accept")).toBe("application/json");
    expect(init.headers.get("Content-Type")).toBe("application/json");
    expect(init.headers.get("X-Request-ID")).toEqual(expect.any(String));
    expect(init.headers.get("X-CSRF-Token")).toBe("csrf_123");
    expect(init.headers.get("Idempotency-Key")).toBe("idem_123");
    expect(init.headers.get("X-Audit-Reason")).toBe("manual retry");
    expect(init.headers.get("X-Recent-MFA")).toBe("mfa_123");
  });

  it("generates a deterministic fallback request ID when UUID is unavailable", async () => {
    const response = jsonResponse({ ok: true });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("crypto", { randomUUID: undefined });
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/health");

    expect(fetchMock.mock.calls[0][1].headers.get("X-Request-ID")).toMatch(
      /^web_req_[a-z0-9]+$/,
    );
  });

  it("returns parsed JSON for successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: true })),
    );

    await expect(apiRequest<{ ok: boolean }>("/health")).resolves.toEqual({
      ok: true,
    });
  });

  it("returns undefined for a successful 204 response", async () => {
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
      vi.fn().mockResolvedValue(jsonResponse({ id: "p_1" })),
    );

    await expect(
      apiRequest<{ id: string }>("/products/p_1", {
        schema: z.object({ id: z.string() }),
      }),
    ).resolves.toEqual({ id: "p_1" });
  });

  it("reports an invalid response contract as an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: 42 })));

    await expect(
      apiRequest<{ id: string }>("/products/p_1", {
        schema: z.object({ id: z.string() }),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 502,
        problem: expect.objectContaining({ code: "INVALID_API_CONTRACT" }),
      }),
    );
  });

  it("converts problem JSON into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: "VALIDATION_ERROR",
            message: "Name is required",
            requestId: "req_1",
          },
          422,
        ),
      ),
    );

    await expect(apiRequest("/products", { method: "POST" })).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 422,
        problem: {
          code: "VALIDATION_ERROR",
          message: "Name is required",
          requestId: "req_1",
        },
      }),
    );
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

    await expect(apiRequest("/health")).rejects.toEqual(
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

  it("propagates invalid JSON from an otherwise successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    );

    await expect(apiRequest("/health")).rejects.toEqual(
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

    const request = apiRequest("/slow", { timeoutMs: 25 });
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

  it("honors an external AbortSignal", async () => {
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

    const request = apiRequest("/cancelled", { signal: controller.signal });
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

  it("propagates network failures without wrapping them", async () => {
    const networkError = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(apiRequest("/offline")).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        status: 0,
        problem: expect.objectContaining({ code: "NETWORK_ERROR" }),
      }),
    );
  });
});
