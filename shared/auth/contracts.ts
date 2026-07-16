export type AppSurface = "public" | "buyer" | "seller" | "admin";

export type FrontendSession = {
  subjectId: string;
  surface: AppSurface;
  authenticated: boolean;
  permissions: readonly string[];
  mfaVerifiedAt: string | null;
  mode: "mock" | "api";
};

export function hasPermission(session: FrontendSession, permission: string) {
  return (
    session.authenticated &&
    (session.permissions.includes("*") ||
      session.permissions.includes(permission))
  );
}

/**
 * Prototype-only session. The Go API remains authoritative for every protected
 * read and mutation; this object only drives mock UI characterization.
 */
export function createMockSession(
  surface: Exclude<AppSurface, "public">,
): FrontendSession {
  return {
    subjectId: `mock_${surface}`,
    surface,
    authenticated: true,
    permissions: surface === "admin" ? ["*"] : [`${surface}.*`],
    mfaVerifiedAt: surface === "admin" ? "2026-07-16T11:55:00+07:00" : null,
    mode: "mock",
  };
}
