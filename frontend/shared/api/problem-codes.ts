/**
 * Stable problem-code catalog (INT-020).
 * Aligned with backend/internal/platform/errors/codes.go + OpenAPI Problem.
 * Domain-specific codes may extend; foundation consumers should prefer these.
 */

/** Foundation / transport problem codes. */
export const PROBLEM_CODES = {
  // Auth / session
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  AUTH_MFA_REQUIRED: "AUTH_MFA_REQUIRED",
  AUTH_MFA_PROOF_INVALID: "AUTH_MFA_PROOF_INVALID",
  AUTH_MFA_PROOF_EXPIRED: "AUTH_MFA_PROOF_EXPIRED",
  AUTH_CSRF_INVALID: "AUTH_CSRF_INVALID",

  // Authorization
  FORBIDDEN: "FORBIDDEN",

  // Resource / validation
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",

  // Conflict / concurrency / idempotency
  CONFLICT: "CONFLICT",
  IDEMPOTENCY_REPLAY: "IDEMPOTENCY_REPLAY",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  STOREFRONT_REVISION_CONFLICT: "STOREFRONT_REVISION_CONFLICT",

  // Rate / availability
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // Protocol / client transport
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  NOT_ACCEPTABLE: "NOT_ACCEPTABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // FE-only transport diagnostics (not emitted by backend)
  HTTP_ERROR: "HTTP_ERROR",
  INVALID_JSON_RESPONSE: "INVALID_JSON_RESPONSE",
  INVALID_API_CONTRACT: "INVALID_API_CONTRACT",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  REQUEST_ABORTED: "REQUEST_ABORTED",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN_OUTCOME: "UNKNOWN_OUTCOME",
} as const;

export type ProblemCode =
  (typeof PROBLEM_CODES)[keyof typeof PROBLEM_CODES] | (string & {});

export type ProblemCodeCategory =
  | "auth"
  | "csrf"
  | "mfa"
  | "permission"
  | "not_found"
  | "validation"
  | "conflict"
  | "idempotency"
  | "rate_limit"
  | "provider"
  | "transport"
  | "internal"
  | "unknown";

const FOUNDATION_CODE_SET = new Set<string>(Object.values(PROBLEM_CODES));

export function isKnownProblemCode(code: string): boolean {
  return FOUNDATION_CODE_SET.has(code);
}

/** Codes that mean expected resource absence (detail adapters may map to null). */
export const RESOURCE_NOT_FOUND_CODES = new Set<string>([
  PROBLEM_CODES.RESOURCE_NOT_FOUND,
]);

/** Codes that indicate CSRF failure on cookie+unsafe methods. */
export const CSRF_PROBLEM_CODES = new Set<string>([
  PROBLEM_CODES.AUTH_CSRF_INVALID,
]);

/** Codes that require session clear / login redirect. */
export const SESSION_EXPIRED_CODES = new Set<string>([
  PROBLEM_CODES.AUTH_REQUIRED,
  PROBLEM_CODES.AUTH_SESSION_EXPIRED,
  PROBLEM_CODES.AUTH_INVALID_CREDENTIALS,
]);

/** Codes for MFA step-up (not full session expiry). */
export const MFA_REQUIRED_CODES = new Set<string>([
  PROBLEM_CODES.AUTH_MFA_REQUIRED,
  PROBLEM_CODES.AUTH_MFA_PROOF_INVALID,
  PROBLEM_CODES.AUTH_MFA_PROOF_EXPIRED,
]);

/** Idempotency body mismatch — never auto-rotate key. */
export const IDEMPOTENCY_CONFLICT_CODES = new Set<string>([
  PROBLEM_CODES.IDEMPOTENCY_CONFLICT,
]);

/** Generic revision/concurrency conflicts (preserve draft; refetch). */
export const CONCURRENCY_CONFLICT_CODES = new Set<string>([
  PROBLEM_CODES.CONFLICT,
  PROBLEM_CODES.STOREFRONT_REVISION_CONFLICT,
  PROBLEM_CODES.IDEMPOTENCY_REPLAY,
]);
