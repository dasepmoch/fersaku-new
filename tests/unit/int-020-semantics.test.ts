import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http-client";
import {
  PROBLEM_CODES,
  isKnownProblemCode,
  RESOURCE_NOT_FOUND_CODES,
} from "@/shared/api/problem-codes";
import {
  classifyApiError,
  classifyThrown,
  isCsrfError,
  isIdempotencyConflictError,
  isPermissionError,
  isRateLimitedError,
  isSafeGetRetryable,
  isSessionExpiredError,
  mapDetailOrThrow,
  mustNotTreatAsEmpty,
  parseRetryAfterHeader,
  rejectAsApiFailure,
} from "@/shared/api/error-policy";
import {
  assertCursorProfile,
  assertNumberedProfile,
  buildCursorPageQuery,
  buildNumberedPageQuery,
  cursorHasMore,
  cursorNext,
  detectPaginationProfile,
  numberedEnvelopeToTablePagination,
  numberedMetaToTablePagination,
  tablePaginationShowingLabel,
} from "@/shared/api/pagination";
import {
  beginIdempotencyIntent,
  bindIdempotencyBody,
  createIdempotencyKey,
  fingerprintBody,
  requireNewIntentAfterIdempotencyConflict,
  resolveIdempotencySend,
} from "@/shared/api/idempotency";
import {
  API_VERSION_PREFIX,
  buildConditionalHeaders,
  CACHE_CONTROL_NO_STORE,
  ensureVersionedApiPath,
  expectsEmptyBody,
  isAsyncAccepted,
  isNoStoreCacheControl,
  isSuccessStatus,
  isVersionedApiPath,
  SUCCESS_STATUSES,
  withExpectedRevision,
} from "@/shared/api/http-semantics";

describe("INT-020 problem code catalog", () => {
  it("exports foundation codes aligned with backend", () => {
    expect(PROBLEM_CODES.AUTH_REQUIRED).toBe("AUTH_REQUIRED");
    expect(PROBLEM_CODES.AUTH_CSRF_INVALID).toBe("AUTH_CSRF_INVALID");
    expect(PROBLEM_CODES.AUTH_MFA_REQUIRED).toBe("AUTH_MFA_REQUIRED");
    expect(PROBLEM_CODES.FORBIDDEN).toBe("FORBIDDEN");
    expect(PROBLEM_CODES.RESOURCE_NOT_FOUND).toBe("RESOURCE_NOT_FOUND");
    expect(PROBLEM_CODES.VALIDATION_FAILED).toBe("VALIDATION_FAILED");
    expect(PROBLEM_CODES.CONFLICT).toBe("CONFLICT");
    expect(PROBLEM_CODES.IDEMPOTENCY_CONFLICT).toBe("IDEMPOTENCY_CONFLICT");
    expect(PROBLEM_CODES.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(PROBLEM_CODES.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(isKnownProblemCode("VALIDATION_FAILED")).toBe(true);
    expect(isKnownProblemCode("NOT_A_REAL_CODE")).toBe(false);
  });
});

describe("INT-020 error mapping policy rows", () => {
  it("400 malformed → form_generic; never empty/mock", () => {
    const c = classifyApiError(400, {
      code: "MALFORMED_REQUEST",
      message: "Bad request",
      requestId: "req_1",
    });
    expect(c.kind).toBe("form_generic");
    expect(c.category).toBe("validation");
    expect(c.isEmptyOrMock).toBe(false);
    expect(c.mutationAutoRetry).toBe(false);
    expect(c.safeGetRetryable).toBe(false);
  });

  it("400 VALIDATION_FAILED → field violations", () => {
    const c = classifyApiError(400, {
      code: PROBLEM_CODES.VALIDATION_FAILED,
      message: "Request validation failed",
      requestId: "req_2",
      details: {
        fields: [{ field: "email", code: "INVALID", message: "bad" }],
      },
    });
    expect(c.kind).toBe("form_field_violations");
    expect(c.fieldViolations).toEqual([
      { field: "email", code: "INVALID", message: "bad" },
    ]);
    expect(c.isEmptyOrMock).toBe(false);
  });

  it("401 → session_expired (clear cache/redirect login)", () => {
    const c = classifyApiError(401, {
      code: PROBLEM_CODES.AUTH_SESSION_EXPIRED,
      message: "Session expired",
      requestId: "req_3",
    });
    expect(c.kind).toBe("session_expired");
    expect(c.category).toBe("auth");
    expect(c.safeGetRetryable).toBe(false);
    expect(isSessionExpiredError(new ApiError(401, c))).toBe(true);
  });

  it("403 CSRF → csrf_recovery (one controlled recovery)", () => {
    const c = classifyApiError(403, {
      code: PROBLEM_CODES.AUTH_CSRF_INVALID,
      message: "Invalid CSRF",
      requestId: "req_4",
    });
    expect(c.kind).toBe("csrf_recovery");
    expect(c.category).toBe("csrf");
    expect(isCsrfError(new ApiError(403, c))).toBe(true);
  });

  it("403 permission → permission_denied; no retry", () => {
    const c = classifyApiError(403, {
      code: PROBLEM_CODES.FORBIDDEN,
      message: "Forbidden",
      requestId: "req_5",
    });
    expect(c.kind).toBe("permission_denied");
    expect(c.category).toBe("permission");
    expect(c.safeGetRetryable).toBe(false);
    expect(isPermissionError(new ApiError(403, c))).toBe(true);
  });

  it("404 resource → resource_not_found; mayMapToNull only for RESOURCE_NOT_FOUND", () => {
    const c = classifyApiError(404, {
      code: PROBLEM_CODES.RESOURCE_NOT_FOUND,
      message: "Not found",
      requestId: "req_6",
    });
    expect(c.kind).toBe("resource_not_found");
    expect(c.mayMapToNull).toBe(true);
    expect(RESOURCE_NOT_FOUND_CODES.has(c.code)).toBe(true);
    expect(c.isEmptyOrMock).toBe(false);
  });

  it("409 conflict → conflict_preserve_draft", () => {
    const c = classifyApiError(409, {
      code: PROBLEM_CODES.CONFLICT,
      message: "Conflict",
      requestId: "req_7",
    });
    expect(c.kind).toBe("conflict_preserve_draft");
    expect(c.category).toBe("conflict");
    expect(c.mutationAutoRetry).toBe(false);
  });

  it("409 IDEMPOTENCY_CONFLICT → do not auto-rotate key", () => {
    const c = classifyApiError(409, {
      code: PROBLEM_CODES.IDEMPOTENCY_CONFLICT,
      message: "Idempotency key conflict",
      requestId: "req_8",
    });
    expect(c.kind).toBe("idempotency_conflict");
    expect(c.category).toBe("idempotency");
    expect(isIdempotencyConflictError(new ApiError(409, c))).toBe(true);
    expect(requireNewIntentAfterIdempotencyConflict()).toEqual({
      mustCreateNewIntent: true,
      autoRotateKey: false,
    });
  });

  it("429 → rate_limited with Retry-After; safe GET retryable", () => {
    const c = classifyApiError(
      429,
      {
        code: PROBLEM_CODES.RATE_LIMITED,
        message: "Too many requests",
        requestId: "req_9",
      },
      { retryAfterSeconds: 30 },
    );
    expect(c.kind).toBe("rate_limited");
    expect(c.retryAfterSeconds).toBe(30);
    expect(c.safeGetRetryable).toBe(true);
    expect(c.mutationAutoRetry).toBe(false);
    expect(isRateLimitedError(new ApiError(429, c))).toBe(true);
  });

  it("5xx → retry_safe_get; mutation not auto-retry", () => {
    const c = classifyApiError(500, {
      code: PROBLEM_CODES.INTERNAL_ERROR,
      message: "Internal",
      requestId: "req_10",
    });
    expect(c.kind).toBe("retry_safe_get");
    expect(c.safeGetRetryable).toBe(true);
    expect(c.mutationAutoRetry).toBe(false);
  });

  it("network/timeout → transport_failure; safe GET retryable", () => {
    const net = classifyApiError(0, {
      code: PROBLEM_CODES.NETWORK_ERROR,
      message: "offline",
      requestId: "req_11",
    });
    expect(net.kind).toBe("transport_failure");
    expect(net.safeGetRetryable).toBe(true);
    expect(net.isEmptyOrMock).toBe(false);

    const timeout = classifyApiError(408, {
      code: PROBLEM_CODES.REQUEST_TIMEOUT,
      message: "timeout",
      requestId: "req_12",
    });
    expect(timeout.kind).toBe("transport_failure");
    expect(timeout.safeGetRetryable).toBe(true);
  });

  it("MFA required is not session_expired", () => {
    const c = classifyApiError(401, {
      code: PROBLEM_CODES.AUTH_MFA_REQUIRED,
      message: "MFA required",
      requestId: "req_mfa",
    });
    expect(c.kind).toBe("mfa_required");
    expect(c.category).toBe("mfa");
  });

  it("parseRetryAfterHeader supports seconds and HTTP-date", () => {
    expect(parseRetryAfterHeader("12")).toBe(12);
    expect(parseRetryAfterHeader(null)).toBeUndefined();
    expect(parseRetryAfterHeader("not-a-date")).toBeUndefined();
    const future = new Date(Date.now() + 5000).toUTCString();
    const seconds = parseRetryAfterHeader(future);
    expect(seconds).toBeGreaterThanOrEqual(4);
    expect(seconds).toBeLessThanOrEqual(6);
  });
});

describe("INT-020 query/UI cannot treat API errors as empty/mock", () => {
  it("mustNotTreatAsEmpty is always true for classified failures", () => {
    const err = new ApiError(500, {
      code: PROBLEM_CODES.INTERNAL_ERROR,
      message: "fail",
    });
    expect(mustNotTreatAsEmpty(err)).toBe(true);
  });

  it("rejectAsApiFailure never returns empty array", () => {
    expect(() =>
      rejectAsApiFailure(
        new ApiError(404, {
          code: PROBLEM_CODES.RESOURCE_NOT_FOUND,
          message: "gone",
        }),
      ),
    ).toThrow(ApiError);
  });

  it("mapDetailOrThrow allows null only for expected resource not found", () => {
    const notFound = new ApiError(404, {
      code: PROBLEM_CODES.RESOURCE_NOT_FOUND,
      message: "missing",
    });
    expect(mapDetailOrThrow(undefined, notFound)).toBeNull();

    const forbidden = new ApiError(403, {
      code: PROBLEM_CODES.FORBIDDEN,
      message: "no",
    });
    expect(() => mapDetailOrThrow(undefined, forbidden)).toThrow(ApiError);

    const network = new ApiError(0, {
      code: PROBLEM_CODES.NETWORK_ERROR,
      message: "down",
    });
    expect(() => mapDetailOrThrow([], network)).toThrow(ApiError);
  });

  it("classifyThrown wraps unknown errors as network failure", () => {
    const c = classifyThrown(new Error("boom"));
    expect(c.code).toBe(PROBLEM_CODES.NETWORK_ERROR);
    expect(c.isEmptyOrMock).toBe(false);
  });

  it("isSafeGetRetryable respects policy", () => {
    expect(
      isSafeGetRetryable(
        new ApiError(503, {
          code: PROBLEM_CODES.INTERNAL_ERROR,
          message: "x",
        }),
      ),
    ).toBe(true);
    expect(
      isSafeGetRetryable(
        new ApiError(403, {
          code: PROBLEM_CODES.FORBIDDEN,
          message: "x",
        }),
      ),
    ).toBe(false);
  });
});

describe("INT-020 pagination CursorList vs NumberedPageList", () => {
  it("maps NumberedPageListMeta to TablePagination fields without inventing totals", () => {
    const view = numberedMetaToTablePagination({
      page: 2,
      pageSize: 20,
      totalCount: 74,
      pageCount: 4,
    });
    expect(view).toEqual({
      page: 2,
      pageSize: 20,
      total: 74,
      pageCount: 4,
      start: 20,
      end: 40,
    });
    expect(tablePaginationShowingLabel(view)).toBe(
      "Showing 21-40 of 74 rows",
    );
  });

  it("numbered envelope keeps authoritative total independent of row length", () => {
    const mapped = numberedEnvelopeToTablePagination({
      data: [{ id: "a" }, { id: "b" }],
      meta: {
        requestId: "r",
        timestamp: "2026-07-17T10:00:00Z",
        page: 1,
        pageSize: 20,
        totalCount: 74,
        pageCount: 4,
      },
    });
    expect(mapped.total).toBe(74);
    expect(mapped.rows).toHaveLength(2);
    expect(mapped.pageCount).toBe(4);
  });

  it("empty numbered list still has pageCount and showing label", () => {
    const view = numberedMetaToTablePagination({
      page: 1,
      pageSize: 10,
      totalCount: 0,
      pageCount: 0,
    });
    expect(view.total).toBe(0);
    expect(view.pageCount).toBe(1);
    expect(tablePaginationShowingLabel(view)).toBe("No rows to display");
  });

  it("cursor helpers do not expose total/page jump", () => {
    const meta = {
      requestId: "r",
      timestamp: "2026-07-17T10:00:00Z",
      nextCursor: "opaque_abc",
      hasMore: true,
    };
    assertCursorProfile(meta);
    expect(cursorHasMore(meta)).toBe(true);
    expect(cursorNext(meta)).toBe("opaque_abc");
    expect(detectPaginationProfile(meta)).toBe("cursor");
    expect(detectPaginationProfile({ page: 1, pageSize: 10, totalCount: 0, pageCount: 1 })).toBe(
      "numbered",
    );
  });

  it("buildNumberedPageQuery / buildCursorPageQuery normalize params", () => {
    expect(buildNumberedPageQuery(0, 0)).toEqual({ page: 1, pageSize: 1 });
    expect(buildCursorPageQuery("c1", 25)).toEqual({ cursor: "c1", limit: 25 });
    expect(buildCursorPageQuery(null)).toEqual({});
  });

  it("assertNumberedProfile requires authoritative fields", () => {
    expect(() =>
      assertNumberedProfile({
        requestId: "r",
        timestamp: "2026-07-17T10:00:00Z",
        page: 1,
        pageSize: 10,
        totalCount: 5,
        pageCount: 1,
      }),
    ).not.toThrow();
  });
});

describe("INT-020 idempotency key policy", () => {
  it("creates opaque UUID keys without PII", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    });
    const key = createIdempotencyKey();
    expect(key).toBe("11111111-2222-4333-8444-555555555555");
    expect(key).not.toMatch(/@|store|amount/i);
    vi.unstubAllGlobals();
  });

  it("same intent + same body reuses key; body change is local conflict", () => {
    const intent = beginIdempotencyIntent({ amount: 100, sku: "a" });
    const body = { amount: 100, sku: "a" };
    expect(resolveIdempotencySend(intent, body)).toEqual({
      action: "reuse",
      key: intent.key,
    });
    expect(resolveIdempotencySend(intent, { amount: 200, sku: "a" })).toEqual({
      action: "conflict_local",
      key: intent.key,
      reason: "body_mismatch",
    });
  });

  it("fingerprint is order-stable for plain objects", () => {
    expect(fingerprintBody({ b: 1, a: 2 })).toBe(
      fingerprintBody({ a: 2, b: 1 }),
    );
  });

  it("bindIdempotencyBody then send reuses key", () => {
    let intent = beginIdempotencyIntent();
    intent = bindIdempotencyBody(intent, { x: 1 });
    expect(resolveIdempotencySend(intent, { x: 1 }).action).toBe("reuse");
  });
});

describe("INT-020 HTTP success / versioning / cache semantics", () => {
  it("defines success statuses including async 202 and empty 204", () => {
    expect(isSuccessStatus(SUCCESS_STATUSES.OK)).toBe(true);
    expect(isSuccessStatus(SUCCESS_STATUSES.CREATED)).toBe(true);
    expect(isAsyncAccepted(202)).toBe(true);
    expect(expectsEmptyBody(204)).toBe(true);
    expect(expectsEmptyBody(200)).toBe(false);
    expect(isSuccessStatus(400)).toBe(false);
  });

  it("builds If-Match / expectedRevision helpers", () => {
    expect(buildConditionalHeaders({ ifMatch: '"rev-3"' })).toEqual({
      "If-Match": '"rev-3"',
    });
    expect(withExpectedRevision({ title: "x" }, 3)).toEqual({
      title: "x",
      expectedRevision: 3,
    });
  });

  it("documents no-store for secret/private reads", () => {
    expect(isNoStoreCacheControl(CACHE_CONTROL_NO_STORE)).toBe(true);
    expect(isNoStoreCacheControl("public, max-age=60")).toBe(false);
  });

  it("freezes /v1 API path versioning", () => {
    expect(API_VERSION_PREFIX).toBe("/v1");
    expect(isVersionedApiPath("/v1/status")).toBe(true);
    expect(ensureVersionedApiPath("/status")).toBe("/v1/status");
    expect(ensureVersionedApiPath("/v1/auth/login")).toBe("/v1/auth/login");
  });
});
