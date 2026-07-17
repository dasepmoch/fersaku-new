/**
 * INT-170 — map classified transport errors to existing lifecycle surfaces.
 * No new UI chrome: only stable behavior keys + existing copy when available.
 * Request ID is for operator telemetry; not injected into frozen user copy.
 */

import type { ClassifiedApiError, ErrorBehavior } from "./error-policy";
import { classifyThrown } from "./error-policy";

/** Existing lifecycle surface from UI-050 (no new panels). */
export type LifecycleSurface =
  | "form_field"
  | "form_generic"
  | "session_login"
  | "csrf_recovery"
  | "permission_boundary"
  | "not_found"
  | "conflict_preserve"
  | "idempotency_conflict"
  | "rate_limited"
  | "mfa_required"
  | "retry_safe_get"
  | "mutation_unknown"
  | "transport_error"
  | "route_error";

export type ErrorPresentation = {
  behavior: ErrorBehavior;
  surface: LifecycleSurface;
  /** Existing user-facing message only — never invent support/request-id copy. */
  userMessage: string;
  /** Always present for operator correlation when known. */
  requestId?: string;
  code: string;
  status: number;
  fieldViolations: ClassifiedApiError["fieldViolations"];
  retryAfterSeconds?: number;
  /** True when list/query must not treat this as empty/mock success. */
  mustNotTreatAsEmpty: true;
  /** Safe GET may retry; mutations must not auto-retry. */
  safeGetRetryable: boolean;
  /** Never auto-retry mutations. */
  mutationAutoRetry: false;
  /** Show requestId in UI only when an approved existing control already does. */
  showRequestIdToUser: false;
};

const BEHAVIOR_SURFACE: Record<ErrorBehavior, LifecycleSurface> = {
  form_generic: "form_generic",
  form_field_violations: "form_field",
  session_expired: "session_login",
  csrf_recovery: "csrf_recovery",
  permission_denied: "permission_boundary",
  resource_not_found: "not_found",
  conflict_preserve_draft: "conflict_preserve",
  idempotency_conflict: "idempotency_conflict",
  rate_limited: "rate_limited",
  mfa_required: "mfa_required",
  retry_safe_get: "retry_safe_get",
  mutation_unknown: "mutation_unknown",
  transport_failure: "transport_error",
};

/**
 * Present a thrown/classified error for existing UI binding.
 * Does not invent request-id user copy (UXE-005 / UI-080).
 */
export function presentClassifiedError(
  classified: ClassifiedApiError,
): ErrorPresentation {
  return {
    behavior: classified.kind,
    surface: BEHAVIOR_SURFACE[classified.kind] ?? "route_error",
    userMessage: classified.message,
    requestId: classified.requestId,
    code: classified.code,
    status: classified.status,
    fieldViolations: classified.fieldViolations,
    retryAfterSeconds: classified.retryAfterSeconds,
    mustNotTreatAsEmpty: true,
    safeGetRetryable: classified.safeGetRetryable,
    mutationAutoRetry: false,
    showRequestIdToUser: false,
  };
}

export function presentThrownError(error: unknown): ErrorPresentation {
  return presentClassifiedError(classifyThrown(error));
}

/**
 * Operator telemetry fields for a presented error (pre-redaction caller context).
 * requestId always included when known; never includes raw response body.
 */
export function operatorErrorTelemetry(
  presentation: ErrorPresentation,
  extra?: {
    releaseId?: string;
    surface?: string;
    operationId?: string;
    routeTemplate?: string;
  },
): Record<string, unknown> {
  return {
    releaseId: extra?.releaseId,
    surface: extra?.surface ?? presentation.surface,
    operationId: extra?.operationId,
    requestId: presentation.requestId,
    status: presentation.status,
    code: presentation.code,
    kind: presentation.behavior,
    routeTemplate: extra?.routeTemplate,
  };
}
