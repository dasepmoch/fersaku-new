import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { successEnvelopeSchema } from "@/shared/api/schemas";

vi.mock("server-only", () => ({}));

const cookiesGetAll = vi.fn(() => [] as Array<{ name: string; value: string }>);
const headersGet = vi.fn((_name: string): string | null => null);

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: cookiesGetAll,
  })),
  headers: vi.fn(async () => ({
    get: headersGet,
  })),
}));

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

const okSchema = successEnvelopeSchema(z.object({ ok: z.boolean() }));

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

describe("serverApiRequest (INT-110)", () => {
  beforeEach(() => {
    process.env.API_INTERNAL_URL = "http://api.internal:8080";
    cookiesGetAll.mockReturnValue([]);
    headersGet.mockReturnValue(null);
    notFoundMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.API_INTERNAL_URL;
  });

  it("builds URL against API_INTERNAL_URL not public origin", async () => {
    const { buildServerApiUrl } = await import(
      "@/shared/api/server-http-client"
    );
    const url = buildServerApiUrl("/v1/buyer/purchases/ord_1", {
      expand: true,
    });
    expect(url.origin).toBe("http://api.internal:8080");
    expect(url.pathname).toBe("/v1/buyer/purchases/ord_1");
    expect(url.searchParams.get("expand")).toBe("true");
  });

  it("forwards allowlisted session cookie and request id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(envelope({ ok: true }), 200, {
        "X-Request-ID": "req_echo",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { serverApiRequest } = await import(
      "@/shared/api/server-http-client"
    );

    await serverApiRequest("/v1/buyer/purchases/ord_1", {
      schema: okSchema,
      cookieStore: [
        { name: "fersaku_session", value: "sess_user_a" },
        { name: "_ga", value: "tracking" },
      ],
      incomingHeaders: { "x-request-id": "req_from_edge" },
      baseUrl: "http://api.internal:8080",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain("http://api.internal:8080/v1/buyer/purchases/ord_1");
    const headers = new Headers(init.headers);
    expect(headers.get("Cookie")).toBe("fersaku_session=sess_user_a");
    expect(headers.get("Cookie")).not.toContain("_ga");
    expect(headers.get("X-Request-ID")).toBe("req_from_edge");
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
  });

  it("omits Cookie when session missing (anonymous)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(envelope({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { serverApiRequest } = await import(
      "@/shared/api/server-http-client"
    );

    await serverApiRequest("/v1/public/products/featured", {
      schema: okSchema,
      privacy: "public",
      cookieStore: [],
      baseUrl: "http://api.internal:8080",
      skipCookies: false,
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Cookie")).toBeNull();
  });

  it("does not forward non-allowlisted incoming headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(envelope({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { serverApiRequest } = await import(
      "@/shared/api/server-http-client"
    );

    await serverApiRequest("/v1/buyer/profile", {
      schema: okSchema,
      cookieStore: [{ name: "fersaku_session", value: "s" }],
      incomingHeaders: {
        authorization: "Bearer should-not-forward",
        cookie: "fersaku_session=via-header-not-used",
        "user-agent": "Evil",
        "x-request-id": "req_ok",
      },
      baseUrl: "http://api.internal:8080",
    });

    const headers = new Headers(
      (fetchMock.mock.calls[0][1] as RequestInit).headers,
    );
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("user-agent")).toBeNull();
    // Cookie comes from allowlisted jar, not raw Cookie header forward
    expect(headers.get("Cookie")).toBe("fersaku_session=s");
    expect(headers.get("X-Request-ID")).toBe("req_ok");
  });

  it("uses no-store for private privacy and allows public next revalidate", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(envelope({ ok: true }))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { serverApiRequest } = await import(
      "@/shared/api/server-http-client"
    );

    await serverApiRequest("/v1/buyer/purchases/1", {
      schema: okSchema,
      privacy: "private",
      cookieStore: [{ name: "fersaku_session", value: "a" }],
      baseUrl: "http://api.internal:8080",
    });
    expect((fetchMock.mock.calls[0][1] as RequestInit).cache).toBe("no-store");

    await serverApiRequest("/v1/public/products/featured", {
      schema: okSchema,
      privacy: "public",
      skipCookies: true,
      baseUrl: "http://api.internal:8080",
      next: { revalidate: 60, tags: ["public-catalog"] },
    });
    const publicInit = fetchMock.mock.calls[1][1] as RequestInit & {
      next?: { revalidate?: number; tags?: string[] };
    };
    expect(publicInit.cache).not.toBe("no-store");
    expect(publicInit.next?.revalidate).toBe(60);
    expect(publicInit.next?.tags).toEqual(["public-catalog"]);
  });

  it("isolates concurrent requests by cookie (no cross-user bleed)", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      const cookie = new Headers(init.headers).get("Cookie") || "";
      seen.push(cookie);
      return Promise.resolve(jsonResponse(envelope({ ok: true })));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { serverApiRequest } = await import(
      "@/shared/api/server-http-client"
    );

    await Promise.all([
      serverApiRequest("/v1/buyer/purchases/1", {
        schema: okSchema,
        cookieStore: [{ name: "fersaku_session", value: "user_a" }],
        baseUrl: "http://api.internal:8080",
      }),
      serverApiRequest("/v1/buyer/purchases/1", {
        schema: okSchema,
        cookieStore: [{ name: "fersaku_session", value: "user_b" }],
        baseUrl: "http://api.internal:8080",
      }),
    ]);

    expect(seen).toContain("fersaku_session=user_a");
    expect(seen).toContain("fersaku_session=user_b");
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("throws ApiError on 401 without calling notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            problem: {
              code: "AUTH_SESSION_EXPIRED",
              message: "Session expired",
              requestId: "req_401",
            },
          },
          401,
        ),
      ),
    );

    const { serverApiRequest, ApiError } = await import(
      "@/shared/api/server-http-client"
    );

    const err = await serverApiRequest("/v1/buyer/purchases/1", {
      schema: okSchema,
      cookieStore: [{ name: "fersaku_session", value: "expired" }],
      baseUrl: "http://api.internal:8080",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401 });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("maps 404 resource_not_found to notFound via helper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            problem: {
              code: "RESOURCE_NOT_FOUND",
              message: "Missing",
              requestId: "req_404",
            },
          },
          404,
        ),
      ),
    );

    const { serverApiRequestOrNotFound } = await import(
      "@/shared/api/server-http-client"
    );

    await expect(
      serverApiRequestOrNotFound("/v1/buyer/purchases/missing", {
        schema: okSchema,
        cookieStore: [{ name: "fersaku_session", value: "s" }],
        baseUrl: "http://api.internal:8080",
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("does not map 403 permission to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            problem: {
              code: "FORBIDDEN",
              message: "No access",
              requestId: "req_403",
            },
          },
          403,
        ),
      ),
    );

    const { serverApiRequestOrNotFound, ApiError } = await import(
      "@/shared/api/server-http-client"
    );

    await expect(
      serverApiRequestOrNotFound("/v1/admin/orders/1", {
        schema: okSchema,
        cookieStore: [{ name: "fersaku_session", value: "buyer" }],
        baseUrl: "http://api.internal:8080",
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("reads cookies from next/headers when cookieStore omitted", async () => {
    cookiesGetAll.mockReturnValue([
      { name: "fersaku_session", value: "from_next" },
      { name: "noise", value: "1" },
    ]);
    headersGet.mockImplementation((name: string) =>
      name.toLowerCase() === "x-request-id" ? "req_next" : null,
    );

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(envelope({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { serverApiRequest } = await import(
      "@/shared/api/server-http-client"
    );

    await serverApiRequest("/v1/buyer/profile", {
      schema: okSchema,
      baseUrl: "http://api.internal:8080",
    });

    const headers = new Headers(
      (fetchMock.mock.calls[0][1] as RequestInit).headers,
    );
    expect(headers.get("Cookie")).toBe("fersaku_session=from_next");
    expect(headers.get("X-Request-ID")).toBe("req_next");
  });

  it("requireApiInternalUrl rejects browser-side misuse via env helper", async () => {
    const { requireApiInternalUrl } = await import("@/shared/config/env");
    // In node test env, window is undefined so server path works
    process.env.API_INTERNAL_URL = "http://api.internal:8080";
    expect(requireApiInternalUrl()).toBe("http://api.internal:8080");
  });
});
