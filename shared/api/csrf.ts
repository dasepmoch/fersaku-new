/**
 * INT-130 — session-bound CSRF (memory only).
 *
 * Threat model (chosen pattern #2 — authenticated issuance/rotation):
 * - Session cookie is HttpOnly + Secure + SameSite (Lax/Strict).
 * - CSRF proof is a random token bound to the server session row as a hash only.
 * - Client holds the raw token in process memory for the double-submit header
 *   `X-CSRF-Token` on cookie-auth unsafe methods (wired via INT-100 hooks).
 * - After hard refresh, raw token is gone; GET `/v1/auth/session` re-issues
 *   (rotates hash + returns new raw once). Safe method; does not mutate business state.
 * - Never localStorage / sessionStorage / URL / logs (reporter redacts *token* keys).
 * - Stale cookie without resolvable session does not require CSRF (BE allows
 *   anonymous login/logout/magic-link recovery under Origin/same-site topology).
 * - Controlled recovery: on AUTH_CSRF_INVALID, re-bootstrap at most once and
 *   replay the mutation with the **same** idempotency key (no double intent).
 */

import { ApiError } from "./api-error";
import { isCsrfError } from "./error-policy";
import {
  clearHttpClientSessionHooks,
  getHttpClientSessionHooks,
  setHttpClientSessionHooks,
  apiRequest,
} from "./http-client";
import {
  authSessionEnvelopeSchema,
  type AuthSessionDataDto,
  type Meta,
} from "./schemas";

type AuthSessionEnvelope = {
  data: AuthSessionDataDto;
  meta: Meta;
};

/** In-memory only. Never write to localStorage/sessionStorage. */
let memoryToken: string | undefined;

let bootstrapInFlight: Promise<string | undefined> | null = null;

/**
 * Single-flight recovery gate: at most one re-issue cycle until success or clear.
 * Prevents recovery storms; mutation layer still reuses the same idempotency key.
 */
let recoveryConsumed = false;
let recoveryInFlight: Promise<string | undefined> | null = null;

export type AuthSessionData = AuthSessionDataDto;
export { authSessionEnvelopeSchema, authSessionDataSchema } from "./schemas";

/**
 * Store raw CSRF after login / magic-link / password-change.
 * Resets the one-shot recovery gate so a later AUTH_CSRF_INVALID may recover once.
 */
export function setCsrfToken(token: string | undefined): void {
  writeMemoryToken(token, { resetRecoveryGate: true });
}

/** Current memory token (sync). Prefer ensureCsrfToken for hard-refresh paths. */
export function getCsrfToken(): string | undefined {
  return memoryToken;
}

/** Clear on logout / session expiry. */
export function clearCsrfToken(): void {
  memoryToken = undefined;
  recoveryConsumed = false;
  bootstrapInFlight = null;
  recoveryInFlight = null;
}

function writeMemoryToken(
  token: string | undefined,
  opts: { resetRecoveryGate: boolean },
): void {
  if (token === undefined || token === "") {
    memoryToken = undefined;
    return;
  }
  memoryToken = token;
  if (opts.resetRecoveryGate) {
    recoveryConsumed = false;
  }
}

/**
 * Return memory token, or bootstrap once via GET /v1/auth/session (hard refresh).
 * Does not use persistent storage.
 */
export async function ensureCsrfToken(): Promise<string | undefined> {
  if (memoryToken) return memoryToken;
  return bootstrapCsrfFromSession({ resetRecoveryGate: true });
}

async function bootstrapCsrfFromSession(opts: {
  resetRecoveryGate: boolean;
}): Promise<string | undefined> {
  if (bootstrapInFlight) return bootstrapInFlight;
  bootstrapInFlight = (async () => {
    try {
      const envelope = await apiRequest<AuthSessionEnvelope>(
        "/v1/auth/session",
        {
          method: "GET",
          schema: authSessionEnvelopeSchema,
          skipCsrf: true,
        },
      );
      const token = envelope.data.csrfToken;
      writeMemoryToken(token, { resetRecoveryGate: opts.resetRecoveryGate });
      return token;
    } catch {
      return undefined;
    } finally {
      bootstrapInFlight = null;
    }
  })();
  return bootstrapInFlight;
}

/**
 * One controlled CSRF recovery: re-issue via GET /session and replace memory token.
 * Subsequent calls return undefined until setCsrfToken/clearCsrfToken resets the gate.
 */
export async function recoverCsrfOnce(): Promise<string | undefined> {
  if (recoveryConsumed) return undefined;
  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = (async () => {
    recoveryConsumed = true;
    memoryToken = undefined;
    // Do not reset recovery gate on bootstrap — keep one-shot semantics.
    const token = await bootstrapCsrfFromSession({
      resetRecoveryGate: false,
    });
    return token;
  })();

  try {
    return await recoveryInFlight;
  } finally {
    recoveryInFlight = null;
  }
}

/**
 * Run a mutation; on AUTH_CSRF_INVALID, recover once and retry the same fn.
 * Caller must close over the same idempotency key (do not mint a new key).
 */
export async function withCsrfRecovery<T>(
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    if (!isCsrfError(error)) throw error;
    const token = await recoverCsrfOnce();
    if (!token) throw error;
    return await execute();
  }
}

export function isCsrfProblemError(error: unknown): boolean {
  return isCsrfError(error);
}

/**
 * Wire INT-100 session hooks for automatic X-CSRF-Token on unsafe methods.
 * Merges with existing hooks (preserves onSessionExpired).
 */
export function wireHttpClientCsrfHooks(): void {
  const existing = getHttpClientSessionHooks();
  setHttpClientSessionHooks({
    ...existing,
    getCsrfToken: ensureCsrfToken,
  });
}

/** Test helper: drop only CSRF hook without clearing other session hooks. */
export function unwireHttpClientCsrfHooks(): void {
  const existing = getHttpClientSessionHooks();
  setHttpClientSessionHooks({
    onSessionExpired: existing.onSessionExpired,
  });
}

/** Test-only: reset module state. */
export function __resetCsrfModuleForTests(): void {
  clearCsrfToken();
  clearHttpClientSessionHooks();
}

export function assertCsrfNotInWebStorage(): void {
  if (typeof window === "undefined") return;
  const keys = [
    ...Object.keys(window.localStorage || {}),
    ...Object.keys(window.sessionStorage || {}),
  ];
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower.includes("csrf") || lower.includes("x-csrf")) {
      throw new Error(`CSRF must not use web storage key: ${key}`);
    }
  }
}

export { ApiError };
