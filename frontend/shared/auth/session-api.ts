/**
 * INT-120 — session transport (bootstrap + logout).
 * CSRF raw is applied via INT-130 setCsrfToken only — never stored on claims.
 */

import { apiRequest } from "@/shared/api/http-client";
import {
  authMessageEnvelopeSchema,
  authSessionEnvelopeSchema,
  type AuthSessionDataDto,
} from "@/shared/api/schemas";
import { ApiError } from "@/shared/api/api-error";
import {
  clearCsrfToken,
  setCsrfToken,
} from "@/shared/api/csrf";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  mapAuthSessionToClaims,
  type SessionClaims,
} from "./session-model";

export type BootstrapResult =
  | { ok: true; claims: SessionClaims; csrfToken: string }
  | { ok: false; kind: "anonymous" | "expired" | "error"; code: string | null };

/**
 * GET /v1/auth/session — single-flight owned by session-store.
 * Applies CSRF to INT-130 memory store; returns claims without raw token.
 */
export async function fetchSessionBootstrap(): Promise<BootstrapResult> {
  try {
    const envelope = await apiRequest<{
      data: AuthSessionDataDto;
      meta: { requestId: string; timestamp: string };
    }>("/v1/auth/session", {
      method: "GET",
      schema: authSessionEnvelopeSchema,
      skipCsrf: true,
    });
    const csrf = envelope.data.csrfToken;
    setCsrfToken(csrf);
    const claims = mapAuthSessionToClaims(envelope.data, "api");
    if (!claims) {
      clearCsrfToken();
      return { ok: false, kind: "error", code: "SESSION_CLAIMS_INVALID" };
    }
    return { ok: true, claims, csrfToken: csrf };
  } catch (error) {
    clearCsrfToken();
    if (error instanceof ApiError) {
      const code = error.code;
      if (
        error.status === 401 ||
        code === PROBLEM_CODES.AUTH_REQUIRED ||
        code === PROBLEM_CODES.AUTH_SESSION_EXPIRED
      ) {
        return {
          ok: false,
          kind:
            code === PROBLEM_CODES.AUTH_SESSION_EXPIRED
              ? "expired"
              : "anonymous",
          code,
        };
      }
      return { ok: false, kind: "error", code };
    }
    return { ok: false, kind: "error", code: "NETWORK_ERROR" };
  }
}

/**
 * POST /v1/auth/logout — server-side revoke + clear cookie.
 * CSRF via hooks when available; anonymous/stale still best-effort.
 */
export async function postLogout(): Promise<void> {
  try {
    await apiRequest("/v1/auth/logout", {
      method: "POST",
      schema: authMessageEnvelopeSchema,
    });
  } catch (error) {
    // Stale session / already logged out: still clear local state.
    if (error instanceof ApiError && error.status === 401) {
      return;
    }
    // Network: local clear still proceeds; rethrow only for unexpected 5xx if needed.
    if (error instanceof ApiError && error.status >= 500) {
      throw error;
    }
  } finally {
    clearCsrfToken();
  }
}

/** Apply CSRF after login/magic-link response (domain forms call this). */
export function applyLoginCsrf(csrfToken: string | undefined): void {
  if (csrfToken) setCsrfToken(csrfToken);
  else clearCsrfToken();
}
