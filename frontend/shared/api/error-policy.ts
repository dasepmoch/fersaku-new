/**
 * INT-020 FE error classification + mapping policy.
 * Query/UI must not treat classified API failures as empty/mock success.
 */

import type { ApiProblem } from "./contracts";
import { ApiError } from "./api-error";
import {
  CSRF_PROBLEM_CODES,
  IDEMPOTENCY_CONFLICT_CODES,
  MFA_REQUIRED_CODES,
  PROBLEM_CODES,
  RESOURCE_NOT_FOUND_CODES,
  SESSION_EXPIRED_CODES,
  type ProblemCodeCategory,
} from "./problem-codes";

/** High-level FE behavior for a classified transport error. */
export type ErrorBehavior =
  | "form_generic"
  | "form_field_violations"
  | "session_expired"
  | "csrf_recovery"
  | "permission_denied"
  | "resource_not_found"
  | "conflict_preserve_draft"
  | "idempotency_conflict"
  | "rate_limited"
  | "mfa_required"
  | "retry_safe_get"
  | "mutation_unknown"
  | "transport_failure";

export type ClassifiedApiError = {
  kind: ErrorBehavior;
  category: ProblemCodeCategory;
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
  fieldViolations: Array<{ field: string; code: string; message?: string }>;
  /** Seconds from Retry-After when present (429/backpressure). */
  retryAfterSeconds?: number;
  /** True when adapters may map this to detail `null` (not empty list success). */
  mayMapToNull: boolean;
  /** Safe GET may retry with backoff; mutations must not auto-retry. */
  safeGetRetryable: boolean;
  /** Mutations must enter recovery/unknown — never auto-retry. */
  mutationAutoRetry: false;
  /** Never treat as empty/mock success for list/query surfaces. */
  isEmptyOrMock: false;
};

export type ClassifyOptions = {
  retryAfterSeconds?: number;
};

function fieldViolationsFromDetails(
  details?: Record<string, unknown>,
): ClassifiedApiError["fieldViolations"] {
  if (!details || typeof details !== "object") return [];
  const fields = details.fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((item): item is { field: string; code: string; message?: string } =>
      Boolean(
        item &&
        typeof item === "object" &&
        typeof (item as { field?: unknown }).field === "string" &&
        typeof (item as { code?: unknown }).code === "string",
      ),
    )
    .map((item) => ({
      field: item.field,
      code: item.code,
      message: typeof item.message === "string" ? item.message : undefined,
    }));
}

function base(
  partial: Omit<
    ClassifiedApiError,
    "mutationAutoRetry" | "isEmptyOrMock" | "fieldViolations" | "mayMapToNull"
  > & {
    fieldViolations?: ClassifiedApiError["fieldViolations"];
    mayMapToNull?: boolean;
  },
): ClassifiedApiError {
  return {
    ...partial,
    fieldViolations: partial.fieldViolations ?? [],
    mayMapToNull: partial.mayMapToNull ?? false,
    mutationAutoRetry: false,
    isEmptyOrMock: false,
  };
}

/**
 * Classify HTTP status + problem code into FE policy rows (INT-020 table).
 * Always returns isEmptyOrMock: false so query layers cannot mask failures.
 */
export function classifyApiError(
  status: number,
  problem: ApiProblem,
  options?: ClassifyOptions,
): ClassifiedApiError {
  const code = problem.code || PROBLEM_CODES.HTTP_ERROR;
  const message = problem.message || "Request failed";
  const requestId = problem.requestId;
  const details = problem.details;
  const fieldViolations = fieldViolationsFromDetails(details);
  const retryAfterSeconds = options?.retryAfterSeconds;
  const common = {
    status,
    code,
    message,
    requestId,
    details,
    fieldViolations,
    retryAfterSeconds,
  };

  // Transport / client-side
  if (
    code === PROBLEM_CODES.NETWORK_ERROR ||
    code === PROBLEM_CODES.REQUEST_TIMEOUT ||
    status === 0
  ) {
    return base({
      ...common,
      kind: "transport_failure",
      category: "transport",
      safeGetRetryable: true,
    });
  }

  if (code === PROBLEM_CODES.REQUEST_ABORTED || status === 499) {
    return base({
      ...common,
      kind: "transport_failure",
      category: "transport",
      safeGetRetryable: false,
    });
  }

  if (
    code === PROBLEM_CODES.INVALID_API_CONTRACT ||
    code === PROBLEM_CODES.INVALID_JSON_RESPONSE
  ) {
    return base({
      ...common,
      kind: "transport_failure",
      category: "transport",
      safeGetRetryable: false,
    });
  }

  // 401 — clear private cache/session, redirect login
  if (status === 401 || SESSION_EXPIRED_CODES.has(code)) {
    if (MFA_REQUIRED_CODES.has(code)) {
      return base({
        ...common,
        kind: "mfa_required",
        category: "mfa",
        safeGetRetryable: false,
      });
    }
    return base({
      ...common,
      kind: "session_expired",
      category: "auth",
      safeGetRetryable: false,
    });
  }

  // MFA required may also surface as 403 in some gates — prefer code
  if (MFA_REQUIRED_CODES.has(code)) {
    return base({
      ...common,
      kind: "mfa_required",
      category: "mfa",
      safeGetRetryable: false,
    });
  }

  // 403 CSRF — one controlled recovery; mutation replay same idempotency key
  if (status === 403 && CSRF_PROBLEM_CODES.has(code)) {
    return base({
      ...common,
      kind: "csrf_recovery",
      category: "csrf",
      safeGetRetryable: false,
    });
  }

  // 403 permission — existing boundary; no retry
  if (status === 403 || code === PROBLEM_CODES.FORBIDDEN) {
    return base({
      ...common,
      kind: "permission_denied",
      category: "permission",
      safeGetRetryable: false,
    });
  }

  // 404 resource — detail only may null on expected not-found codes
  if (status === 404 || RESOURCE_NOT_FOUND_CODES.has(code)) {
    const mayMapToNull = RESOURCE_NOT_FOUND_CODES.has(code);
    return base({
      ...common,
      kind: "resource_not_found",
      category: "not_found",
      mayMapToNull,
      safeGetRetryable: false,
    });
  }

  // 409 idempotency conflict — do not generate new key automatically
  if (status === 409 && IDEMPOTENCY_CONFLICT_CODES.has(code)) {
    return base({
      ...common,
      kind: "idempotency_conflict",
      category: "idempotency",
      safeGetRetryable: false,
    });
  }

  // 409 conflict — preserve draft; refetch revision
  if (status === 409 || code === PROBLEM_CODES.CONFLICT) {
    return base({
      ...common,
      kind: "conflict_preserve_draft",
      category: "conflict",
      safeGetRetryable: false,
    });
  }

  // 429 — honor Retry-After; no retry storm
  if (status === 429 || code === PROBLEM_CODES.RATE_LIMITED) {
    return base({
      ...common,
      kind: "rate_limited",
      category: "rate_limit",
      safeGetRetryable: true,
    });
  }

  // 400 VALIDATION_FAILED — field violations
  if (status === 400 && code === PROBLEM_CODES.VALIDATION_FAILED) {
    return base({
      ...common,
      kind: "form_field_violations",
      category: "validation",
      safeGetRetryable: false,
    });
  }

  // 400 malformed / other — generic form error; log request ID only
  if (status === 400) {
    return base({
      ...common,
      kind: "form_generic",
      category: "validation",
      safeGetRetryable: false,
    });
  }

  // Provider / unknown outcome
  if (
    code === PROBLEM_CODES.PROVIDER_UNAVAILABLE ||
    code === PROBLEM_CODES.SERVICE_UNAVAILABLE ||
    code === PROBLEM_CODES.UNKNOWN_OUTCOME
  ) {
    return base({
      ...common,
      kind:
        code === PROBLEM_CODES.UNKNOWN_OUTCOME
          ? "mutation_unknown"
          : "retry_safe_get",
      category: "provider",
      safeGetRetryable: code !== PROBLEM_CODES.UNKNOWN_OUTCOME,
    });
  }

  // 5xx
  if (status >= 500) {
    return base({
      ...common,
      kind: "retry_safe_get",
      category: "internal",
      safeGetRetryable: true,
    });
  }

  // 408 gateway timeout style
  if (status === 408) {
    return base({
      ...common,
      kind: "transport_failure",
      category: "transport",
      safeGetRetryable: true,
    });
  }

  return base({
    ...common,
    kind: "transport_failure",
    category: "unknown",
    safeGetRetryable: false,
  });
}

export function classifyThrown(
  error: unknown,
  options?: ClassifyOptions,
): ClassifiedApiError {
  if (error instanceof ApiError) {
    return classifyApiError(error.status, error.problem, options);
  }
  if (error instanceof Error) {
    return classifyApiError(
      0,
      {
        code: PROBLEM_CODES.NETWORK_ERROR,
        message: error.message || "The API request could not reach the server.",
      },
      options,
    );
  }
  return classifyApiError(
    0,
    {
      code: PROBLEM_CODES.NETWORK_ERROR,
      message: "The API request could not reach the server.",
    },
    options,
  );
}

/**
 * Parse Retry-After header (seconds or HTTP-date). Returns seconds delay or undefined.
 */
export function parseRetryAfterHeader(
  value: string | null | undefined,
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  const seconds = Math.ceil((dateMs - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

/**
 * Detail adapters: only expected resource-not-found may become null.
 * All other errors rethrow so UI cannot show empty/mock.
 */
export function mapDetailOrThrow<T>(
  result: T | null | undefined,
  error: unknown,
): T | null {
  if (error == null) {
    return result ?? null;
  }
  const classified = classifyThrown(error);
  if (classified.mayMapToNull && classified.kind === "resource_not_found") {
    return null;
  }
  if (error instanceof Error) throw error;
  throw new ApiError(classified.status, {
    code: classified.code,
    message: classified.message,
    requestId: classified.requestId,
    details: classified.details,
  });
}

/**
 * List/query helpers must never convert API errors into empty arrays.
 * Call on catch paths; always throws after classification (for type narrowing).
 */
export function rejectAsApiFailure(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const classified = classifyThrown(error);
  throw new ApiError(classified.status, {
    code: classified.code,
    message: classified.message,
    requestId: classified.requestId,
    details: classified.details,
  });
}

/** True when this error must not be presented as empty list / mock data. */
export function mustNotTreatAsEmpty(error: unknown): boolean {
  const classified = classifyThrown(error);
  return classified.isEmptyOrMock === false;
}

export function isSessionExpiredError(error: unknown): boolean {
  return classifyThrown(error).kind === "session_expired";
}

export function isCsrfError(error: unknown): boolean {
  return classifyThrown(error).kind === "csrf_recovery";
}

export function isIdempotencyConflictError(error: unknown): boolean {
  return classifyThrown(error).kind === "idempotency_conflict";
}

export function isPermissionError(error: unknown): boolean {
  return classifyThrown(error).kind === "permission_denied";
}

export function isRateLimitedError(error: unknown): boolean {
  return classifyThrown(error).kind === "rate_limited";
}

export function isSafeGetRetryable(error: unknown): boolean {
  return classifyThrown(error).safeGetRetryable;
}
