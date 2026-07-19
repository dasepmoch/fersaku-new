/**
 * INT-120 — pure route guard decisions (no Next.js imports).
 */

import {
  buildLoginHref,
  homePathForSurface,
  isAuthEntryPath,
  loginPathForSurface,
  surfaceFromPathname,
} from "./return-to";
import type { SessionClaims, SessionSnapshot, SessionSurface } from "./session-model";

export type GuardDecision =
  | { action: "allow" }
  | { action: "wait" }
  | { action: "redirect"; href: string; reason: string };

export type GuardInput = {
  pathname: string;
  search?: string;
  snapshot: SessionSnapshot;
  /**
   * Required surface for this layout. When omitted, inferred from pathname
   * for private areas; public paths always allow.
   */
  requiredSurface?: SessionSurface;
  /**
   * When true (admin console), unauthenticated MFA is still allowed to reach
   * verify routes later (INT-140). Guards only redirect missing/wrong surface.
   */
  requireMfaVerified?: boolean;
};

function pathWithSearch(pathname: string, search?: string): string {
  if (!search) return pathname;
  return search.startsWith("?") ? `${pathname}${search}` : `${pathname}?${search}`;
}

export function decideRouteGuard(input: GuardInput): GuardDecision {
  const { pathname, search, snapshot } = input;
  const required =
    input.requiredSurface ??
    ((): SessionSurface | null => {
      const s = surfaceFromPathname(pathname);
      return s === "public" ? null : s;
    })();

  // Public / auth entry: bounce fully authenticated users home; MFA_PENDING stays on login.
  if (isAuthEntryPath(pathname) || required === null) {
    if (snapshot.status === "loading") {
      // Auth entry can render while loading; avoid flash redirect loops.
      return { action: "allow" };
    }
    if (
      snapshot.status === "authenticated" &&
      snapshot.claims &&
      isAuthEntryPath(pathname)
    ) {
      const surface = snapshot.claims.surface;
      // Admin login only accepts admin; seller login accepts seller; buyer same.
      const entrySurface = surfaceFromAuthEntry(pathname);
      if (entrySurface && snapshot.claims.surface === entrySurface) {
        return {
          action: "redirect",
          href: homePathForSurface(surface),
          reason: "already_authenticated",
        };
      }
      if (entrySurface && snapshot.claims.surface !== entrySurface) {
        // Wrong surface on this login shell: stay (or go to correct login).
        return {
          action: "redirect",
          href: loginPathForSurface(snapshot.claims.surface),
          reason: "wrong_surface_auth_entry",
        };
      }
    }
    // MFA_PENDING may use auth-entry shells for verify (no bounce to console).
    return { action: "allow" };
  }

  if (snapshot.status === "loading") {
    return { action: "wait" };
  }

  if (
    (snapshot.status !== "authenticated" && snapshot.status !== "mfa_pending") ||
    !snapshot.claims ||
    !snapshot.claims.subjectId
  ) {
    const returnTo = pathWithSearch(pathname, search);
    return {
      action: "redirect",
      href: buildLoginHref(required, returnTo),
      reason: "missing_session",
    };
  }

  if (snapshot.claims.surface !== required) {
    // Wrong surface: hand off to that surface's login only (admin never accepts seller cookie).
    return {
      action: "redirect",
      href: loginPathForSurface(required),
      reason: "wrong_surface",
    };
  }

  // INT-140: fail-closed — MFA_PENDING cannot use private business shells.
  const needsMfa =
    input.requireMfaVerified ||
    (snapshot.claims.mfaEnabled && !snapshot.claims.mfaVerified) ||
    snapshot.status === "mfa_pending";
  if (needsMfa && !snapshot.claims.mfaVerified) {
    return {
      action: "redirect",
      href: buildLoginHref(required, pathWithSearch(pathname, search)),
      reason: "mfa_pending",
    };
  }

  return { action: "allow" };
}

function surfaceFromAuthEntry(pathname: string): SessionSurface | null {
  const p = pathname.split("?")[0] ?? pathname;
  if (p === "/admin/login") return "admin";
  if (p === "/login") return "seller";
  if (p === "/account/login" || p === "/account/verify") return "buyer";
  return null;
}

export function sessionHasPermission(
  claims: SessionClaims | null | undefined,
  permission: string,
): boolean {
  if (!claims || !permission) return false;
  // Fail closed: empty / unknown permission codes never grant.
  if (claims.permissions.includes("*")) return true;
  return claims.permissions.includes(permission);
}
