/**
 * INT-120 — canonical session model (no raw tokens).
 * CSRF stays in shared/api/csrf memory store only.
 */

import type { AuthSessionDataDto } from "@/shared/api/schemas";

export type AppSurface = "public" | "buyer" | "seller" | "admin";
export type SessionSurface = Exclude<AppSurface, "public">;

export type SessionStatus =
  | "anonymous"
  | "loading"
  | "authenticated"
  | "expired"
  | "error";

export type ImpersonationMeta = {
  active: boolean;
  id: string | null;
  scope: string | null;
  actorId: string | null;
  expiresAt: string | null;
};

/**
 * UI-facing session claims. Never includes session cookie value or CSRF raw.
 */
export type SessionClaims = {
  subjectId: string;
  sessionId: string;
  surface: SessionSurface;
  email: string | null;
  name: string | null;
  status: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  /** True when server session has mfa_verified_at (INT-140 gate consumes this). */
  mfaVerified: boolean;
  permissions: readonly string[];
  roles: readonly string[];
  impersonation: ImpersonationMeta | null;
  mode: "mock" | "api";
};

export type SessionSnapshot = {
  status: SessionStatus;
  claims: SessionClaims | null;
  /** Last bootstrap error code (problem code or transport). */
  errorCode: string | null;
};

export const ANONYMOUS_SNAPSHOT: SessionSnapshot = {
  status: "anonymous",
  claims: null,
  errorCode: null,
};

export const LOADING_SNAPSHOT: SessionSnapshot = {
  status: "loading",
  claims: null,
  errorCode: null,
};

const SURFACE_MAP: Record<string, SessionSurface> = {
  buyer: "buyer",
  seller: "seller",
  admin: "admin",
  BUYER: "buyer",
  SELLER: "seller",
  ADMIN: "admin",
};

export function normalizeSessionSurface(
  raw: string | null | undefined,
): SessionSurface | null {
  if (!raw) return null;
  return SURFACE_MAP[raw] ?? SURFACE_MAP[raw.toLowerCase()] ?? null;
}

export function mapAuthSessionToClaims(
  data: AuthSessionDataDto,
  mode: "mock" | "api",
): SessionClaims | null {
  const surface = normalizeSessionSurface(data.surface);
  const subjectId = data.userId?.trim();
  const sessionId = data.sessionId?.trim();
  if (!surface || !subjectId || !sessionId) return null;

  const imp = data.impersonation;
  const impersonation: ImpersonationMeta | null =
    imp && (imp.active || imp.id)
      ? {
          active: imp.active !== false,
          id: imp.id ?? null,
          scope: imp.scope ?? null,
          actorId: imp.actorId ?? null,
          expiresAt: imp.expiresAt ?? null,
        }
      : null;

  return {
    subjectId,
    sessionId,
    surface,
    email: data.email?.trim() || null,
    name: data.name?.trim() || null,
    status: data.status?.trim() || null,
    emailVerified: Boolean(data.emailVerified),
    mfaEnabled: Boolean(data.mfaEnabled),
    mfaVerified: Boolean(data.mfaVerified),
    permissions: Object.freeze([...(data.permissions ?? [])]),
    roles: Object.freeze([...(data.roles ?? [])]),
    impersonation,
    mode,
  };
}

export function createMockClaims(surface: SessionSurface): SessionClaims {
  return {
    subjectId: `mock_${surface}`,
    sessionId: `mock_sess_${surface}`,
    surface,
    email: `${surface}@mock.local`,
    name: `Mock ${surface}`,
    status: "ACTIVE",
    emailVerified: true,
    mfaEnabled: surface === "admin",
    mfaVerified: surface === "admin",
    permissions:
      surface === "admin"
        ? Object.freeze(["*"])
        : Object.freeze([`${surface}.*`]),
    roles: Object.freeze([surface === "admin" ? "super_admin" : surface]),
    impersonation: null,
    mode: "mock",
  };
}

export function claimsCacheIdentity(claims: SessionClaims | null): string {
  if (!claims) return "anonymous";
  const imp = claims.impersonation?.id ?? "";
  return `${claims.mode}:${claims.subjectId}:${claims.sessionId}:${claims.surface}:${imp}`;
}
