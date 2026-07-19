import type { SessionClaims, AppSurface } from "./session-model";
import { createMockClaims } from "./session-model";

export type { AppSurface };

/**
 * @deprecated Prefer SessionClaims from session-model (INT-120).
 * Kept for gradual migration of prototype callers.
 */
export type FrontendSession = {
  subjectId: string;
  surface: AppSurface;
  authenticated: boolean;
  permissions: readonly string[];
  mfaVerifiedAt: string | null;
  mode: "mock" | "api";
};

export function hasPermission(
  session: FrontendSession | SessionClaims | null | undefined,
  permission: string,
) {
  if (!session || !permission) return false;
  const perms =
    "permissions" in session ? session.permissions : ([] as readonly string[]);
  const authenticated =
    "authenticated" in session
      ? Boolean(session.authenticated)
      : Boolean((session as SessionClaims).subjectId);
  return authenticated && (perms.includes("*") || perms.includes(permission));
}

export function toFrontendSession(claims: SessionClaims): FrontendSession {
  return {
    subjectId: claims.subjectId,
    surface: claims.surface,
    authenticated: true,
    permissions: claims.permissions,
    mfaVerifiedAt: claims.mfaVerified ? "1970-01-01T00:00:00.000Z" : null,
    mode: claims.mode,
  };
}

/**
 * Prototype-only session. API mode must use bootstrapSession (never hardcode identity).
 */
export function createMockSession(
  surface: Exclude<AppSurface, "public">,
): FrontendSession {
  return toFrontendSession(createMockClaims(surface));
}
