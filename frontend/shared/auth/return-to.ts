/**
 * INT-120 — safe returnTo: relative same-origin path only (no open redirect).
 */

import type { SessionSurface } from "./session-model";

const LOGIN_PATH: Record<SessionSurface, string> = {
  buyer: "/account/login",
  seller: "/login",
  admin: "/admin/login",
};

const SURFACE_HOME: Record<SessionSurface, string> = {
  buyer: "/account/purchases",
  seller: "/dashboard",
  admin: "/admin",
};

const SURFACE_PREFIX: Record<SessionSurface, string> = {
  buyer: "/account",
  seller: "/dashboard",
  admin: "/admin",
};

/** Public auth entry paths that should bounce authenticated users to surface home. */
export const AUTH_ENTRY_PATHS = [
  "/login",
  "/account/login",
  "/admin/login",
  "/account/verify",
] as const;

export function loginPathForSurface(surface: SessionSurface): string {
  return LOGIN_PATH[surface];
}

export function homePathForSurface(surface: SessionSurface): string {
  return SURFACE_HOME[surface];
}

export function surfacePrefix(surface: SessionSurface): string {
  return SURFACE_PREFIX[surface];
}

/**
 * Accept only relative paths on this origin.
 * Rejects protocol-relative, absolute URLs, backslashes, control chars, and empty.
 */
export function isSafeReturnTo(value: string | null | undefined): boolean {
  if (value == null) return false;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return false;
  if (raw.includes("\\")) return false;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return false;
  // Block scheme-like and encoded absolute tricks after decode.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return false;
  if (decoded.includes("\\") || decoded.includes("@")) return false;
  return true;
}

/**
 * Parse returnTo from query string (value may be full search without ?).
 * Returns sanitized path+search or null.
 */
export function sanitizeReturnTo(
  value: string | null | undefined,
): string | null {
  if (!isSafeReturnTo(value)) return null;
  const raw = value!.trim();
  // Strip fragment if present (never use hash for navigation target).
  const withoutHash = raw.split("#")[0] ?? raw;
  if (!isSafeReturnTo(withoutHash)) return null;
  return withoutHash;
}

/** returnTo allowed for a surface login (must stay under that surface prefix). */
export function sanitizeReturnToForSurface(
  value: string | null | undefined,
  surface: SessionSurface,
): string | null {
  const path = sanitizeReturnTo(value);
  if (!path) return null;
  const pathname = path.split("?")[0] ?? path;
  const prefix = SURFACE_PREFIX[surface];
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    // Do not bounce back to the login page itself.
    if (pathname === LOGIN_PATH[surface]) return null;
    return path;
  }
  return null;
}

export function buildLoginHref(
  surface: SessionSurface,
  returnTo?: string | null,
): string {
  const login = LOGIN_PATH[surface];
  const safe = sanitizeReturnToForSurface(returnTo, surface);
  if (!safe) return login;
  return `${login}?returnTo=${encodeURIComponent(safe)}`;
}

export function resolvePostLoginPath(
  surface: SessionSurface,
  returnTo?: string | null,
): string {
  return sanitizeReturnToForSurface(returnTo, surface) ?? SURFACE_HOME[surface];
}

export function isAuthEntryPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return (AUTH_ENTRY_PATHS as readonly string[]).includes(p);
}

/** Infer private surface from pathname, or null for public. */
export function surfaceFromPathname(
  pathname: string,
): SessionSurface | "public" {
  const p = pathname.split("?")[0] ?? pathname;
  if (p === "/admin" || p.startsWith("/admin/")) return "admin";
  if (p === "/dashboard" || p.startsWith("/dashboard/")) return "seller";
  if (p === "/account" || p.startsWith("/account/")) {
    if (p === "/account/login" || p === "/account/verify") return "public";
    return "buyer";
  }
  if (p === "/login") return "public";
  return "public";
}

/** Whether path is a private surface area (including login shells under it). */
export function isPrivateSurfacePath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  if (p === "/admin" || p.startsWith("/admin/")) return true;
  if (p === "/dashboard" || p.startsWith("/dashboard/")) return true;
  if (p === "/account" || p.startsWith("/account/")) {
    return p !== "/account/login" && p !== "/account/verify";
  }
  return false;
}
