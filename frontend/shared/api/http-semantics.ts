/**
 * INT-020 HTTP success semantics, conditional headers, cache, versioning.
 * Policy helpers only — domain adapters apply per operation.
 */

/** Success statuses that must not be collapsed into a single "ok" path. */
export const SUCCESS_STATUSES = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
} as const;

export type SuccessStatus =
  (typeof SUCCESS_STATUSES)[keyof typeof SUCCESS_STATUSES];

export function isSuccessStatus(status: number): status is SuccessStatus {
  return (
    status === 200 ||
    status === 201 ||
    status === 202 ||
    status === 204
  );
}

/** 204 must have no JSON body (backend contract). */
export function expectsEmptyBody(status: number): boolean {
  return status === SUCCESS_STATUSES.NO_CONTENT;
}

/**
 * Async acceptance — mutation is not necessarily complete.
 * Callers must poll/reconcile rather than assume terminal success.
 */
export function isAsyncAccepted(status: number): boolean {
  return status === SUCCESS_STATUSES.ACCEPTED;
}

/** Conditional write headers for mutable resources. */
export type ConditionalWriteHeaders = {
  ifMatch?: string;
  expectedRevision?: number | string;
};

export function buildConditionalHeaders(
  options: ConditionalWriteHeaders,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.ifMatch) {
    headers["If-Match"] = options.ifMatch;
  }
  return headers;
}

/** Body field often paired with If-Match for storefront/profile/role. */
export function withExpectedRevision<T extends Record<string, unknown>>(
  body: T,
  expectedRevision: number | string | undefined,
): T & { expectedRevision?: number | string } {
  if (expectedRevision === undefined) return body;
  return { ...body, expectedRevision };
}

/** Secret / private reads: Cache-Control no-store. */
export const CACHE_CONTROL_NO_STORE = "private, no-store";

export function isNoStoreCacheControl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /no-store/i.test(value);
}

/**
 * API path versioning: browser topology uses `/v1/...`.
 * Relative same-origin is owned by INT-030; this only freezes the prefix rule.
 */
export const API_VERSION_PREFIX = "/v1";

export function isVersionedApiPath(pathname: string): boolean {
  return pathname === API_VERSION_PREFIX || pathname.startsWith(`${API_VERSION_PREFIX}/`);
}

export function ensureVersionedApiPath(pathname: string): string {
  if (isVersionedApiPath(pathname)) return pathname;
  if (pathname.startsWith("/")) return `${API_VERSION_PREFIX}${pathname}`;
  return `${API_VERSION_PREFIX}/${pathname}`;
}
