import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCsrfModuleForTests,
  assertCsrfNotInWebStorage,
  clearCsrfToken,
  ensureCsrfToken,
  getCsrfToken,
  recoverCsrfOnce,
  setCsrfToken,
  wireHttpClientCsrfHooks,
  withCsrfRecovery,
} from "@/shared/api/csrf";
import {
  apiRequest,
  clearHttpClientSessionHooks,
  getHttpClientSessionHooks,
  HTTP_HEADERS,
} from "@/shared/api/http-client";
import { ApiError } from "@/shared/api/api-error";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { z } from "zod";

const okSchema = z.object({
  data: z.object({ ok: z.boolean() }),
  meta: z.object({
    requestId: z.string(),
    timestamp: z.string(),
  }),
});

function envelope(data: unknown, requestId = "req_test") {
  return {
    data,
    meta: {
      requestId,
      timestamp: "2026-07-17T10:00:00Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_test",
    },
  });
}

function problemResponse(status: number, code: string, message = "error") {
  return jsonResponse(
    {
      problem: {
        code,
        message,
        requestId: "req_csrf_fail",
      },
    },
    status,
  );
}

describe("INT-130 CSRF store / recovery", () => {
  beforeEach(() => {
    __resetCsrfModuleForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    __resetCsrfModuleForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps token in memory only (not localStorage/sessionStorage)", () => {
    const storage = {
      local: {} as Record<string, string>,
      session: {} as Record<string, string>,
    };
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.local[k] ?? null,
      setItem: (k: string, v: string) => {
        storage.local[k] = v;
      },
      removeItem: (k: string) => {
        delete storage.local[k];
      },
      clear: () => {
        storage.local = {};
      },
      key: () => null,
      get length() {
        return Object.keys(storage.local).length;
      },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.session[k] ?? null,
      setItem: (k: string, v: string) => {
        storage.session[k] = v;
      },
      removeItem: (k: string) => {
        delete storage.session[k];
      },
      clear: () => {
        storage.session = {};
      },
      key: () => null,
      get length() {
        return Object.keys(storage.session).length;
      },
    });

    setCsrfToken("csrf_memory_only");
    expect(getCsrfToken()).toBe("csrf_memory_only");
    expect(Object.keys(storage.local)).toEqual([]);
    expect(Object.keys(storage.session)).toEqual([]);
    expect(() => assertCsrfNotInWebStorage()).not.toThrow();
  });

  it("clearCsrfToken drops memory proof", () => {
    setCsrfToken("csrf_a");
    clearCsrfToken();
    expect(getCsrfToken()).toBeUndefined();
  });

  it("wireHttpClientCsrfHooks injects token on unsafe methods", async () => {
    setCsrfToken("hook_from_store");
    wireHttpClientCsrfHooks();
    expect(getHttpClientSessionHooks().getCsrfToken).toBeTypeOf("function");

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/v1/auth/logout", {
      method: "POST",
      schema: okSchema,
    });

    expect(fetchMock.mock.calls[0][1].headers.get(HTTP_HEADERS.CSRF)).toBe(
      "hook_from_store",
    );
  });

  it("ensureCsrfToken bootstraps from GET /v1/auth/session after hard refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        envelope({
          userId: "u1",
          sessionId: "s1",
          csrfToken: "csrf_reissued",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    wireHttpClientCsrfHooks();

    expect(getCsrfToken()).toBeUndefined();
    const token = await ensureCsrfToken();
    expect(token).toBe("csrf_reissued");
    expect(getCsrfToken()).toBe("csrf_reissued");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/auth/session");
    expect(fetchMock.mock.calls[0][1].method ?? "GET").toMatch(/GET/i);
    expect(
      fetchMock.mock.calls[0][1].headers.get(HTTP_HEADERS.CSRF),
    ).toBeNull();
  });

  it("recoverCsrfOnce re-issues at most once", async () => {
    let sessionCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/v1/auth/session")) {
        sessionCalls += 1;
        return Promise.resolve(
          jsonResponse(
            envelope({
              csrfToken: `csrf_rot_${sessionCalls}`,
              sessionId: "s1",
            }),
          ),
        );
      }
      return Promise.resolve(jsonResponse(envelope({ ok: true })));
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await recoverCsrfOnce();
    expect(first).toBe("csrf_rot_1");
    const second = await recoverCsrfOnce();
    expect(second).toBeUndefined();
    expect(sessionCalls).toBe(1);
  });

  it("withCsrfRecovery replays mutation once with same idempotency key", async () => {
    const key = createIdempotencyKey();
    const seenKeys: string[] = [];
    let postCount = 0;

    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        const path = String(url);
        if (path.includes("/v1/auth/session")) {
          return Promise.resolve(
            jsonResponse(
              envelope({ csrfToken: "csrf_recovered", sessionId: "s1" }),
            ),
          );
        }
        if (path.includes("/v1/demo/mutate")) {
          postCount += 1;
          const headers = new Headers(init?.headers);
          seenKeys.push(headers.get(HTTP_HEADERS.IDEMPOTENCY) || "");
          if (postCount === 1) {
            return Promise.resolve(
              problemResponse(
                403,
                PROBLEM_CODES.AUTH_CSRF_INVALID,
                "Invalid CSRF",
              ),
            );
          }
          return Promise.resolve(jsonResponse(envelope({ ok: true })));
        }
        return Promise.resolve(jsonResponse(envelope({ ok: true })));
      });
    vi.stubGlobal("fetch", fetchMock);
    wireHttpClientCsrfHooks();
    setCsrfToken("stale_csrf");

    const result = await withCsrfRecovery(() =>
      apiRequest("/v1/demo/mutate", {
        method: "POST",
        body: { a: 1 },
        idempotencyKey: key,
        schema: okSchema,
      }),
    );

    expect(result).toEqual(expect.objectContaining({ data: { ok: true } }));
    expect(postCount).toBe(2);
    expect(seenKeys).toEqual([key, key]);
    expect(getCsrfToken()).toBe("csrf_recovered");
  });

  it("withCsrfRecovery does not retry non-CSRF errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(problemResponse(403, PROBLEM_CODES.FORBIDDEN, "nope"));
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("csrf_ok");
    wireHttpClientCsrfHooks();

    await expect(
      withCsrfRecovery(() =>
        apiRequest("/v1/demo/mutate", {
          method: "POST",
          schema: okSchema,
        }),
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: PROBLEM_CODES.FORBIDDEN,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("missing/invalid CSRF surfaces as AUTH_CSRF_INVALID (typed)", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          problemResponse(403, PROBLEM_CODES.AUTH_CSRF_INVALID, "Invalid CSRF"),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    clearHttpClientSessionHooks();

    try {
      await apiRequest("/v1/auth/logout", {
        method: "POST",
        schema: okSchema,
        requireSchema: false,
      });
      expect.fail("expected ApiError");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(403);
      expect((e as ApiError).code).toBe(PROBLEM_CODES.AUTH_CSRF_INVALID);
    }
  });

  it("login→mutation path: set token then auto-attach on POST", async () => {
    // Simulate login response handling (INT-120 will own full session store).
    setCsrfToken("csrf_from_login");
    wireHttpClientCsrfHooks();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(envelope({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/v1/me/profile", {
      method: "PATCH",
      body: { displayName: "A" },
      schema: okSchema,
    });

    expect(fetchMock.mock.calls[0][1].headers.get(HTTP_HEADERS.CSRF)).toBe(
      "csrf_from_login",
    );
  });
});
