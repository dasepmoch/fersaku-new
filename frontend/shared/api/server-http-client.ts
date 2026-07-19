/**
 * INT-110 — server-only HTTP client for private SSR.
 *
 * Topology: Node fetch → API_INTERNAL_URL (never browser same-origin alone).
 * Auth: explicit Cookie allowlist from next/headers — not credentials:include.
 *
 * Do not import this module from Client Components / browser bundles.
 */
import "server-only";

import type { ZodTypeAny } from "zod";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireApiInternalUrl } from "@/shared/config/env";
import { ApiError } from "./api-error";
import { classifyApiError, parseRetryAfterHeader } from "./error-policy";
import { HTTP_HEADERS, parseProblemPayload } from "./http-client";
import { PROBLEM_CODES } from "./problem-codes";
import { reportTransportError } from "@/shared/observability/reporter";
import {
  buildForwardedCookieHeader,
  pickForwardedRequestHeaders,
  type CookiePair,
} from "./server-cookie-forward";

export { ApiError } from "./api-error";
export {
  SESSION_COOKIE_NAME,
  FORWARDED_COOKIE_ALLOWLIST,
  FORWARDED_HEADER_ALLOWLIST,
  buildForwardedCookieHeader,
  getAllowlistedCookieValue,
  pickForwardedRequestHeaders,
  isForwardableCookieName,
} from "./server-cookie-forward";

const DEFAULT_TIMEOUT_MS = 15_000;

export type ServerRequestPrivacy = "private" | "public";

export type ServerRequestOptions<TBody = unknown> = Omit<
  RequestInit,
  "body" | "signal" | "credentials"
> & {
  body?: TBody;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  schema?: ZodTypeAny;
  requireSchema?: boolean;
  requestId?: string;
  csrfToken?: string;
  idempotencyKey?: string;
  auditReason?: string;
  recentMfaProof?: string;
  ifMatch?: string;
  /**
   * private (default): cache: "no-store", no shared tags — session-bound data.
   * public: may pass `next.revalidate` / `next.tags` for catalog-style reads.
   */
  privacy?: ServerRequestPrivacy;
  /**
   * Override cookie jar (tests). When omitted, reads Next `cookies()`.
   */
  cookieStore?: Iterable<CookiePair>;
  /**
   * Override incoming headers (tests). When omitted, reads Next `headers()`.
   */
  incomingHeaders?: Headers | Record<string, string | null | undefined>;
  /**
   * Override internal base (tests only). Production uses requireApiInternalUrl().
   */
  baseUrl?: string;
  /**
   * When true, skip attaching Cookie from the request jar (anonymous public SSR).
   */
  skipCookies?: boolean;
};

let fallbackRequestSequence = 0;

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackRequestSequence += 1;
  return `ssr_req_${fallbackRequestSequence.toString(36)}`;
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

function reportTransportDiagnostic(
  error: ApiError,
  context: {
    path?: string;
    phase?: string;
    operationId?: string;
    routeTemplate?: string;
    surface?: string;
    /** Non-sensitive privacy class only — never secrets. */
    privacy?: string;
  },
): void {
  // Never attach body/headers/secrets — requestId + codes only (INT-170).
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  const routeTemplate =
    context.routeTemplate ||
    (context.path ? sanitizeServerRouteTemplate(context.path) : undefined);
  reportTransportError(
    error,
    {
      source: "server-http-client",
      status: error.status,
      code: error.code,
      requestId: error.requestId,
      kind: classified.kind,
      phase: context.phase,
      operationId: context.operationId,
      routeTemplate,
      surface: context.surface,
    },
    context.privacy ? { privacy: context.privacy } : undefined,
  );
}

function sanitizeServerRouteTemplate(pathname: string): string {
  return pathname
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/{id}",
    )
    .replace(/\/(str|usr|ord|prod|mer|chk|req)_[A-Za-z0-9]+/g, "/{$1}")
    .replace(/\/\d{3,}/g, "/{n}");
}

/**
 * Absolute URL against server-only API_INTERNAL_URL (fixed config host).
 * Never uses NEXT_PUBLIC_* or browser relative `/v1` alone.
 */
export function buildServerApiUrl(
  pathname: string,
  query?: ServerRequestOptions<never>["query"],
  baseUrl?: string,
): URL {
  const base = (baseUrl ?? requireApiInternalUrl()).replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = new URL(path, `${base}/`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

/**
 * Collect allowlisted cookies + request-id from the current Next request.
 * Safe for Server Components / Route Handlers only.
 */
export async function getServerRequestForwarding(): Promise<{
  cookieHeader: string | undefined;
  requestId: string | undefined;
  cookies: CookiePair[];
}> {
  const jar = await cookies();
  const all: CookiePair[] = jar.getAll().map((c) => ({
    name: c.name,
    value: c.value,
  }));
  const cookieHeader = buildForwardedCookieHeader(all);

  const incoming = await headers();
  const requestId =
    incoming.get(HTTP_HEADERS.REQUEST_ID) ||
    incoming.get("x-request-id") ||
    undefined;

  return { cookieHeader, requestId, cookies: all };
}

/**
 * Server-side API fetch with cookie allowlist + internal base URL.
 * Always sets explicit Cookie when session present; never relies on
 * credentials:include (Node has no browser cookie jar for the user).
 */
export async function serverApiRequest<TResponse, TBody = never>(
  pathname: string,
  options: ServerRequestOptions<TBody> = {},
): Promise<TResponse> {
  const {
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    schema,
    requireSchema = true,
    requestId: explicitRequestId,
    csrfToken,
    idempotencyKey,
    auditReason,
    recentMfaProof,
    ifMatch,
    body,
    headers: requestHeaders,
    method,
    privacy = "private",
    cookieStore,
    incomingHeaders,
    baseUrl,
    skipCookies = false,
    cache,
    next,
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

  const headersOut = new Headers(requestHeaders);
  if (!headersOut.has(HTTP_HEADERS.ACCEPT)) {
    headersOut.set(HTTP_HEADERS.ACCEPT, "application/json");
  }
  if (body !== undefined && !headersOut.has(HTTP_HEADERS.CONTENT_TYPE)) {
    headersOut.set(HTTP_HEADERS.CONTENT_TYPE, "application/json");
  }

  // Incoming allowlisted headers (request-id only today)
  let incoming: Headers | Record<string, string | null | undefined>;
  if (incomingHeaders) {
    incoming = incomingHeaders;
  } else {
    const h = await headers();
    incoming = h;
  }
  const forwarded = pickForwardedRequestHeaders(incoming);
  forwarded.forEach((value, key) => {
    if (!headersOut.has(key)) headersOut.set(key, value);
  });

  const requestId =
    explicitRequestId ||
    headersOut.get(HTTP_HEADERS.REQUEST_ID) ||
    createRequestId();
  if (!headersOut.has(HTTP_HEADERS.REQUEST_ID)) {
    headersOut.set(HTTP_HEADERS.REQUEST_ID, requestId);
  }
  if (!headersOut.has(HTTP_HEADERS.TRACEPARENT)) {
    const hex = requestId
      .toLowerCase()
      .replace(/[^0-9a-f]/g, "")
      .padEnd(32, "0")
      .slice(0, 32);
    headersOut.set(HTTP_HEADERS.TRACEPARENT, `00-${hex}-0000000000000001-01`);
  }

  // Cookie allowlist — explicit header, not credentials jar
  if (!skipCookies && !headersOut.has("Cookie")) {
    let pairs: CookiePair[];
    if (cookieStore) {
      pairs = [...cookieStore];
    } else {
      const jar = await cookies();
      pairs = jar.getAll().map((c) => ({ name: c.name, value: c.value }));
    }
    const cookieHeader = buildForwardedCookieHeader(pairs);
    if (cookieHeader) {
      headersOut.set("Cookie", cookieHeader);
    }
  }

  if (idempotencyKey) headersOut.set(HTTP_HEADERS.IDEMPOTENCY, idempotencyKey);
  if (auditReason) headersOut.set(HTTP_HEADERS.AUDIT_REASON, auditReason);
  if (recentMfaProof) {
    headersOut.set(HTTP_HEADERS.RECENT_MFA_PROOF, recentMfaProof);
  }
  if (ifMatch) headersOut.set(HTTP_HEADERS.IF_MATCH, ifMatch);
  if (csrfToken && !headersOut.has(HTTP_HEADERS.CSRF)) {
    headersOut.set(HTTP_HEADERS.CSRF, csrfToken);
  }

  const effectiveRequestId =
    headersOut.get(HTTP_HEADERS.REQUEST_ID) || requestId;

  // Private SSR: never share cache across users / CDN
  const fetchCache: RequestCache =
    privacy === "private" ? "no-store" : (cache ?? "default");
  const fetchNext = privacy === "private" ? undefined : next;

  try {
    const url = buildServerApiUrl(pathname, query, baseUrl);
    const response = await fetch(url, {
      ...requestInit,
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Explicit Cookie header only — do not use credentials as SSR auth path
      credentials: "omit",
      headers: headersOut,
      signal: combined.signal,
      cache: fetchCache,
      ...(fetchNext ? { next: fetchNext } : {}),
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

      reportTransportDiagnostic(apiError, {
        path: pathname,
        phase: "http_error",
        privacy,
      });
      throw apiError;
    }

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
            "serverApiRequest requires a response schema for live adapters (INT-110).",
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

/**
 * Map expected resource-not-found to Next `notFound()`.
 * 401/403 (session/permission) rethrow — never mask as not-found.
 */
export function rethrowForServerComponent(error: unknown): never {
  if (error instanceof ApiError) {
    const classified = classifyApiError(error.status, error.problem, {
      retryAfterSeconds: error.retryAfterSeconds,
    });
    if (classified.kind === "resource_not_found") {
      notFound();
    }
    throw error;
  }
  throw error;
}

/**
 * Convenience: call serverApiRequest and map expected 404 → notFound().
 * Auth/permission errors propagate for route guards (INT-120).
 */
export async function serverApiRequestOrNotFound<TResponse, TBody = never>(
  pathname: string,
  options?: ServerRequestOptions<TBody>,
): Promise<TResponse> {
  try {
    return await serverApiRequest<TResponse, TBody>(pathname, options);
  } catch (error) {
    rethrowForServerComponent(error);
  }
}
