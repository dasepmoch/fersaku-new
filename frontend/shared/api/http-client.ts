import type { ZodTypeAny } from "zod";
import { getApiInternalUrl, getBrowserApiBaseUrl } from "@/shared/config/env";
import type { ApiProblem } from "./contracts";
import { ApiError } from "./api-error";
import { classifyApiError, parseRetryAfterHeader } from "./error-policy";
import { PROBLEM_CODES } from "./problem-codes";
import {
  METRIC_NAMES,
  reportOperationMetric,
  reportTransportError,
} from "@/shared/observability/reporter";

export { ApiError } from "./api-error";

const DEFAULT_TIMEOUT_MS = 15_000;

/** Header names aligned with OpenAPI / backend (INT-100). */
export const HTTP_HEADERS = {
  REQUEST_ID: "X-Request-ID",
  TRACEPARENT: "traceparent",
  TRACE_ID: "X-Trace-ID",
  CSRF: "X-CSRF-Token",
  IDEMPOTENCY: "Idempotency-Key",
  AUDIT_REASON: "X-Audit-Reason",
  RECENT_MFA_PROOF: "X-Recent-MFA-Proof",
  IF_MATCH: "If-Match",
  RETRY_AFTER: "Retry-After",
  ACCEPT: "Accept",
  CONTENT_TYPE: "Content-Type",
} as const;

export type RequestOptions<TBody = unknown> = Omit<
  RequestInit,
  "body" | "signal"
> & {
  body?: TBody;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Runtime response schema. Required for non-204 success paths in live adapters
   * (architecture gate + runtime when `requireSchema` is true, default).
   * Structural schemas (unknown data) are allowed; caller TResponse is asserted after parse.
   */
  schema?: ZodTypeAny;
  /**
   * When true (default), missing `schema` on non-empty success responses fails closed.
   * Tests may set false for transport-only cases.
   */
  requireSchema?: boolean;
  requestId?: string;
  csrfToken?: string;
  idempotencyKey?: string;
  auditReason?: string;
  recentMfaProof?: string;
  /**
   * When true, attach memory recent MFA proof via session hooks if explicit
   * `recentMfaProof` is omitted (INT-140 privileged ops).
   */
  requireRecentMfa?: boolean;
  ifMatch?: string;
  /** Skip automatic CSRF injection from session hooks (rare). */
  skipCsrf?: boolean;
};

/**
 * Session-layer hooks (INT-120 / INT-130). Register when session bootstrap is ready.
 * Until then, callers may still pass `csrfToken` explicitly.
 */
export type HttpClientSessionHooks = {
  /** Return current CSRF token for cookie-auth unsafe methods, or undefined. */
  getCsrfToken?: () => string | undefined | Promise<string | undefined>;
  /** Return in-memory recent MFA proof for privileged ops (INT-140). */
  getRecentMfaProof?: () => string | undefined | Promise<string | undefined>;
  /** Called once per 401 session-expired burst (deduped). */
  onSessionExpired?: (error: ApiError) => void;
};

let sessionHooks: HttpClientSessionHooks = {};

export function setHttpClientSessionHooks(hooks: HttpClientSessionHooks): void {
  sessionHooks = { ...hooks };
}

export function clearHttpClientSessionHooks(): void {
  sessionHooks = {};
}

export function getHttpClientSessionHooks(): Readonly<HttpClientSessionHooks> {
  return sessionHooks;
}

/** Unsafe methods that require CSRF for cookie session (INT-130 contract). */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isUnsafeMethod(method: string | undefined): boolean {
  return UNSAFE_METHODS.has((method || "GET").toUpperCase());
}

/**
 * Browser topology (INT-030): same-origin relative `/v1/...` by default.
 * Absolute base only when deprecated NEXT_PUBLIC_API_URL is set.
 *
 * Server/SSR/prerender: relative paths are invalid for Node fetch — resolve
 * against API_INTERNAL_URL (never NEXT_PUBLIC_*) so public SSR can reach Go.
 */
export function buildApiUrl(
  pathname: string,
  query?: RequestOptions<never>["query"],
): string | URL {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  let base = getBrowserApiBaseUrl();

  // Node (SSR/build/prerender) cannot fetch relative `/v1` — use internal API.
  if (!base && typeof window === "undefined") {
    base = getApiInternalUrl();
  }

  if (!base) {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined) params.set(key, String(value));
    });
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined)
      url.searchParams.set(key, String(value));
  });
  return url;
}

let fallbackRequestSequence = 0;

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackRequestSequence += 1;
  return `web_req_${fallbackRequestSequence.toString(36)}`;
}

/** W3C traceparent from request id (32-hex trace-id); no payment/KYC payload. */
function traceparentFromRequestId(requestId: string): string {
  const hex = requestId
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "")
    .padEnd(32, "0")
    .slice(0, 32);
  const span = "0000000000000001";
  return `00-${hex}-${span}-01`;
}

function ensureCorrelationHeaders(headers: Headers, requestId: string) {
  if (!headers.has(HTTP_HEADERS.REQUEST_ID)) {
    headers.set(HTTP_HEADERS.REQUEST_ID, requestId);
  }
  if (!headers.has(HTTP_HEADERS.TRACEPARENT)) {
    headers.set(
      HTTP_HEADERS.TRACEPARENT,
      traceparentFromRequestId(
        headers.get(HTTP_HEADERS.REQUEST_ID) || requestId,
      ),
    );
  }
}

function combineAbortSignals(signals: AbortSignal[]) {
  if (signals.length === 1) return { signal: signals[0], cleanup: () => {} };

  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();

  for (const source of signals) {
    const forward = () => {
      if (!controller.signal.aborted) controller.abort(source.reason);
    };
    if (source.aborted) {
      forward();
      break;
    }
    listeners.set(source, forward);
    source.addEventListener("abort", forward, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      listeners.forEach((listener, source) =>
        source.removeEventListener("abort", listener),
      );
    },
  };
}

function contentTypeLooksJson(contentType: string | null): boolean {
  if (!contentType) return false;
  return /application\/json/i.test(contentType) || /\+json/i.test(contentType);
}

async function readJson(
  response: Response,
  requestId: string,
): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.ok ? 502 : response.status, {
      code: PROBLEM_CODES.INVALID_JSON_RESPONSE,
      message: "The API returned an invalid JSON response.",
      requestId: response.headers.get(HTTP_HEADERS.REQUEST_ID) || requestId,
    });
  }
}

/**
 * Parse OpenAPI ProblemEnvelope: `{ problem: { code, message, details?, requestId } }`.
 * Falls back to legacy top-level problem shape only when nested is absent (compat).
 */
export function parseProblemPayload(
  payload: unknown,
  fallbackRequestId: string,
  responseRequestId?: string | null,
): ApiProblem | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const nested =
    root.problem && typeof root.problem === "object"
      ? (root.problem as Record<string, unknown>)
      : null;

  const source = nested ?? root;
  const code = source.code;
  const message = source.message;
  if (
    typeof code !== "string" ||
    !code ||
    typeof message !== "string" ||
    !message
  ) {
    return null;
  }

  const requestId =
    (typeof source.requestId === "string" && source.requestId) ||
    responseRequestId ||
    fallbackRequestId;

  const details =
    source.details && typeof source.details === "object"
      ? (source.details as Record<string, unknown>)
      : undefined;

  return { code, message, details, requestId };
}

// --- 401 session-expired dedupe (INT-100) ---
let sessionExpiredInFlight = false;
let sessionExpiredResetTimer: ReturnType<typeof setTimeout> | null = null;
const SESSION_EXPIRED_DEDUPE_MS = 2_000;

function notifySessionExpired(error: ApiError): void {
  if (sessionExpiredInFlight) return;
  sessionExpiredInFlight = true;
  try {
    sessionHooks.onSessionExpired?.(error);
  } catch {
    // hooks must not break transport
  }
  if (sessionExpiredResetTimer) clearTimeout(sessionExpiredResetTimer);
  sessionExpiredResetTimer = setTimeout(() => {
    sessionExpiredInFlight = false;
    sessionExpiredResetTimer = null;
  }, SESSION_EXPIRED_DEDUPE_MS);
}

/** Test/reset helper for 401 dedupe state. */
export function resetSessionExpiredDedupe(): void {
  sessionExpiredInFlight = false;
  if (sessionExpiredResetTimer) {
    clearTimeout(sessionExpiredResetTimer);
    sessionExpiredResetTimer = null;
  }
}

function reportTransportDiagnostic(
  error: ApiError,
  context: {
    path?: string;
    phase?: string;
    operationId?: string;
    routeTemplate?: string;
    surface?: string;
  },
): void {
  // Never attach body/headers/secrets — requestId + codes only (INT-170).
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  // Prefer routeTemplate over raw path with resource IDs when provided.
  const routeTemplate =
    context.routeTemplate ||
    (context.path ? sanitizeRouteTemplate(context.path) : undefined);
  reportTransportError(error, {
    source: "http-client",
    status: error.status,
    code: error.code,
    requestId: error.requestId,
    kind: classified.kind,
    phase: context.phase,
    operationId: context.operationId,
    routeTemplate,
    surface: context.surface,
  });
  if (
    error.code === PROBLEM_CODES.INVALID_API_CONTRACT ||
    error.code === PROBLEM_CODES.INVALID_JSON_RESPONSE
  ) {
    reportOperationMetric(METRIC_NAMES.contractInvalid, 1, {
      source: "http-client",
      code: error.code,
      requestId: error.requestId,
      routeTemplate,
      phase: context.phase,
    });
  } else if (classified.kind === "session_expired") {
    reportOperationMetric(METRIC_NAMES.sessionExpired, 1, {
      source: "http-client",
      code: error.code,
      requestId: error.requestId,
      routeTemplate,
    });
  } else {
    reportOperationMetric(METRIC_NAMES.error, 1, {
      source: "http-client",
      code: error.code,
      status: error.status,
      requestId: error.requestId,
      routeTemplate,
      phase: context.phase,
    });
  }
}

/** Collapse UUID/resource segments for bounded-cardinality telemetry. */
function sanitizeRouteTemplate(pathname: string): string {
  return pathname
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/{id}",
    )
    .replace(/\/(str|usr|ord|prod|mer|chk|req)_[A-Za-z0-9]+/g, "/{$1}")
    .replace(/\/\d{3,}/g, "/{n}");
}

/**
 * Binary/no-JSON success path (ADM-340 KYC document content stream).
 * Never caches; caller must hold blob only in component memory with short TTL.
 * Errors still use ProblemEnvelope JSON when present.
 */
export async function apiBinaryRequest(
  pathname: string,
  options: Omit<
    RequestOptions<Record<string, unknown> | undefined>,
    "schema" | "requireSchema" | "body"
  > & {
    body?: Record<string, unknown>;
    method?: string;
  } = {},
): Promise<{
  blob: Blob;
  contentType: string;
  documentId?: string;
  documentType?: string;
  requestId: string;
}> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    requestId = createRequestId(),
    csrfToken: explicitCsrf,
    idempotencyKey,
    auditReason,
    recentMfaProof: explicitRecentMfa,
    requireRecentMfa = false,
    ifMatch,
    skipCsrf = false,
    body,
    headers: requestHeaders,
    method = "GET",
    query,
    ...requestInit
  } = options;

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(
      new DOMException("The request timed out.", "TimeoutError"),
    );
  }, timeoutMs);
  const combined = combineAbortSignals(
    [callerSignal, timeoutController.signal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    ),
  );

  const headers = new Headers(requestHeaders);
  if (!headers.has(HTTP_HEADERS.ACCEPT)) {
    headers.set(HTTP_HEADERS.ACCEPT, "*/*");
  }
  if (body !== undefined && !headers.has(HTTP_HEADERS.CONTENT_TYPE)) {
    headers.set(HTTP_HEADERS.CONTENT_TYPE, "application/json");
  }
  ensureCorrelationHeaders(headers, requestId);
  if (idempotencyKey) headers.set(HTTP_HEADERS.IDEMPOTENCY, idempotencyKey);
  if (auditReason) headers.set(HTTP_HEADERS.AUDIT_REASON, auditReason);
  let recentMfaProof = explicitRecentMfa;
  if (!recentMfaProof && requireRecentMfa && sessionHooks.getRecentMfaProof) {
    try {
      recentMfaProof = await sessionHooks.getRecentMfaProof();
    } catch {
      recentMfaProof = undefined;
    }
  }
  if (recentMfaProof) {
    headers.set(HTTP_HEADERS.RECENT_MFA_PROOF, recentMfaProof);
  }
  if (ifMatch) headers.set(HTTP_HEADERS.IF_MATCH, ifMatch);

  let csrfToken = explicitCsrf;
  if (
    !csrfToken &&
    !skipCsrf &&
    isUnsafeMethod(method) &&
    sessionHooks.getCsrfToken
  ) {
    try {
      csrfToken = await sessionHooks.getCsrfToken();
    } catch {
      csrfToken = undefined;
    }
  }
  if (csrfToken && !headers.has(HTTP_HEADERS.CSRF)) {
    headers.set(HTTP_HEADERS.CSRF, csrfToken);
  }

  const effectiveRequestId = headers.get(HTTP_HEADERS.REQUEST_ID) || requestId;

  try {
    const response = await fetch(buildApiUrl(pathname, query), {
      ...requestInit,
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      headers,
      signal: combined.signal,
      cache: "no-store",
    });

    const responseRequestId =
      response.headers.get(HTTP_HEADERS.REQUEST_ID) || effectiveRequestId;
    const retryAfterSeconds = parseRetryAfterHeader(
      response.headers.get(HTTP_HEADERS.RETRY_AFTER),
    );

    if (!response.ok) {
      const contentType = response.headers.get(HTTP_HEADERS.CONTENT_TYPE);
      let payload: unknown = null;
      if (contentTypeLooksJson(contentType) || !contentType) {
        payload = await readJson(response, responseRequestId).catch(
          (error: unknown) => {
            if (error instanceof ApiError) return null;
            throw error;
          },
        );
      }
      const problem = parseProblemPayload(
        payload,
        effectiveRequestId,
        responseRequestId,
      );
      const problemBody = problem ?? {
        code: PROBLEM_CODES.HTTP_ERROR,
        message: `Request failed with status ${response.status}`,
        requestId: responseRequestId,
      };
      const apiError = new ApiError(
        response.status,
        problemBody,
        retryAfterSeconds,
      );
      if (
        classifyApiError(response.status, problemBody, {
          retryAfterSeconds,
        }).kind === "session_expired"
      ) {
        notifySessionExpired(apiError);
      }
      reportTransportDiagnostic(apiError, {
        path: pathname,
        phase: "http_error",
      });
      throw apiError;
    }

    const contentType =
      response.headers.get(HTTP_HEADERS.CONTENT_TYPE) ||
      "application/octet-stream";
    const blob = await response.blob();
    return {
      blob,
      contentType,
      documentId: response.headers.get("X-KYC-Document-Id") ?? undefined,
      documentType: response.headers.get("X-KYC-Document-Type") ?? undefined,
      requestId: responseRequestId,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (
      timedOut ||
      (error instanceof DOMException && error.name === "TimeoutError")
    ) {
      const apiError = new ApiError(504, {
        code: PROBLEM_CODES.REQUEST_TIMEOUT,
        message: "The request timed out.",
        requestId: effectiveRequestId,
      });
      reportTransportDiagnostic(apiError, {
        path: pathname,
        phase: "timeout",
      });
      throw apiError;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    const apiError = new ApiError(502, {
      code: PROBLEM_CODES.NETWORK_ERROR,
      message: "Network request failed.",
      requestId: effectiveRequestId,
    });
    reportTransportDiagnostic(apiError, {
      path: pathname,
      phase: "network",
    });
    throw apiError;
  } finally {
    clearTimeout(timeout);
    combined.cleanup();
  }
}

export async function apiRequest<TResponse, TBody = unknown>(
  pathname: string,
  options: RequestOptions<TBody> = {},
): Promise<TResponse> {
  const {
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    schema,
    requireSchema = true,
    requestId = createRequestId(),
    csrfToken: explicitCsrf,
    idempotencyKey,
    auditReason,
    recentMfaProof: explicitRecentMfa,
    requireRecentMfa = false,
    ifMatch,
    skipCsrf = false,
    body,
    headers: requestHeaders,
    method,
    ...requestInit
  } = options;

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(
      new DOMException("The request timed out.", "TimeoutError"),
    );
  }, timeoutMs);
  const combined = combineAbortSignals(
    [callerSignal, timeoutController.signal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    ),
  );

  const headers = new Headers(requestHeaders);
  if (!headers.has(HTTP_HEADERS.ACCEPT)) {
    headers.set(HTTP_HEADERS.ACCEPT, "application/json");
  }
  if (body !== undefined && !headers.has(HTTP_HEADERS.CONTENT_TYPE)) {
    headers.set(HTTP_HEADERS.CONTENT_TYPE, "application/json");
  }
  ensureCorrelationHeaders(headers, requestId);

  // Sensitive context only when caller opts in (per-operation)
  if (idempotencyKey) headers.set(HTTP_HEADERS.IDEMPOTENCY, idempotencyKey);
  if (auditReason) headers.set(HTTP_HEADERS.AUDIT_REASON, auditReason);
  let recentMfaProof = explicitRecentMfa;
  if (!recentMfaProof && requireRecentMfa && sessionHooks.getRecentMfaProof) {
    try {
      recentMfaProof = await sessionHooks.getRecentMfaProof();
    } catch {
      recentMfaProof = undefined;
    }
  }
  if (recentMfaProof) {
    headers.set(HTTP_HEADERS.RECENT_MFA_PROOF, recentMfaProof);
  }
  if (ifMatch) headers.set(HTTP_HEADERS.IF_MATCH, ifMatch);

  // CSRF: explicit option wins; else session-layer hook for unsafe methods
  let csrfToken = explicitCsrf;
  if (
    !csrfToken &&
    !skipCsrf &&
    isUnsafeMethod(method) &&
    sessionHooks.getCsrfToken
  ) {
    try {
      csrfToken = await sessionHooks.getCsrfToken();
    } catch {
      csrfToken = undefined;
    }
  }
  if (csrfToken && !headers.has(HTTP_HEADERS.CSRF)) {
    headers.set(HTTP_HEADERS.CSRF, csrfToken);
  }

  const effectiveRequestId = headers.get(HTTP_HEADERS.REQUEST_ID) || requestId;

  try {
    const response = await fetch(buildApiUrl(pathname, query), {
      ...requestInit,
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      headers,
      signal: combined.signal,
    });

    const responseRequestId =
      response.headers.get(HTTP_HEADERS.REQUEST_ID) || effectiveRequestId;
    const retryAfterSeconds = parseRetryAfterHeader(
      response.headers.get(HTTP_HEADERS.RETRY_AFTER),
    );

    if (!response.ok) {
      const contentType = response.headers.get(HTTP_HEADERS.CONTENT_TYPE);
      let payload: unknown = null;
      if (contentTypeLooksJson(contentType) || !contentType) {
        payload = await readJson(response, responseRequestId).catch(
          (error: unknown) => {
            if (error instanceof ApiError) return null;
            throw error;
          },
        );
      }

      const problem = parseProblemPayload(
        payload,
        effectiveRequestId,
        responseRequestId,
      );

      const problemBody = problem ?? {
        code: PROBLEM_CODES.HTTP_ERROR,
        message: `Request failed with status ${response.status}`,
        requestId: responseRequestId,
      };
      const apiError = new ApiError(
        response.status,
        problemBody,
        retryAfterSeconds,
      );

      if (
        classifyApiError(response.status, problemBody, {
          retryAfterSeconds,
        }).kind === "session_expired"
      ) {
        notifySessionExpired(apiError);
      }

      reportTransportDiagnostic(apiError, {
        path: pathname,
        phase: "http_error",
      });
      throw apiError;
    }

    // 204 No Content — empty body, no schema required
    if (response.status === 204) {
      return undefined as TResponse;
    }

    const contentType = response.headers.get(HTTP_HEADERS.CONTENT_TYPE);
    if (contentType && !contentTypeLooksJson(contentType)) {
      const apiError = new ApiError(502, {
        code: PROBLEM_CODES.INVALID_API_CONTRACT,
        message: "The API returned a non-JSON content type.",
        requestId: responseRequestId,
        details: { contentType },
      });
      reportTransportDiagnostic(apiError, {
        path: pathname,
        phase: "content_type",
      });
      throw apiError;
    }

    const payload = await readJson(response, responseRequestId);

    if (!schema) {
      if (requireSchema) {
        const apiError = new ApiError(502, {
          code: PROBLEM_CODES.INVALID_API_CONTRACT,
          message:
            "apiRequest requires a response schema for live adapters (INT-100).",
          requestId: responseRequestId,
        });
        reportTransportDiagnostic(apiError, {
          path: pathname,
          phase: "missing_schema",
        });
        throw apiError;
      }
      return payload as TResponse;
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const apiError = new ApiError(502, {
        code: PROBLEM_CODES.INVALID_API_CONTRACT,
        message: "The API response did not match the expected contract.",
        details: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
            code: issue.code,
          })),
        },
        requestId: responseRequestId,
      });
      reportTransportDiagnostic(apiError, {
        path: pathname,
        phase: "schema",
      });
      throw apiError;
    }
    return parsed.data as TResponse;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      const apiError = new ApiError(408, {
        code: PROBLEM_CODES.REQUEST_TIMEOUT,
        message: `The API request exceeded ${timeoutMs}ms.`,
        requestId: effectiveRequestId,
      });
      reportTransportDiagnostic(apiError, {
        path: pathname,
        phase: "timeout",
      });
      throw apiError;
    }
    if (callerSignal?.aborted) {
      throw new ApiError(499, {
        code: PROBLEM_CODES.REQUEST_ABORTED,
        message: "The API request was cancelled.",
        requestId: effectiveRequestId,
      });
    }
    const apiError = new ApiError(0, {
      code: PROBLEM_CODES.NETWORK_ERROR,
      message: "The API request could not reach the server.",
      requestId: effectiveRequestId,
    });
    reportTransportDiagnostic(apiError, {
      path: pathname,
      phase: "network",
    });
    throw apiError;
  } finally {
    clearTimeout(timeout);
    combined.cleanup();
  }
}
