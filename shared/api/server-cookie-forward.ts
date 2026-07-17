/**
 * INT-110 — pure allowlist helpers for SSR cookie/header forwarding.
 * No Next.js imports: unit-testable without server runtime.
 */

/** Canonical session cookie (OpenAPI sessionCookie / BE SESSION_COOKIE_NAME). */
export const SESSION_COOKIE_NAME = "fersaku_session";

/**
 * Cookies that may be forwarded from the incoming browser request to
 * `API_INTERNAL_URL`. Never forward arbitrary cookies (tracking, third-party).
 */
export const FORWARDED_COOKIE_ALLOWLIST = [SESSION_COOKIE_NAME] as const;

/** Incoming request headers that may be forwarded to the internal API. */
export const FORWARDED_HEADER_ALLOWLIST = [
  "x-request-id", // normalized lower-case for lookup
] as const;

export type CookiePair = {
  name: string;
  value: string;
};

/**
 * Build a `Cookie` request header value containing only allowlisted names.
 * Returns undefined when no allowlisted cookies are present (anonymous SSR).
 */
export function buildForwardedCookieHeader(
  cookies: Iterable<CookiePair>,
  allowlist: readonly string[] = FORWARDED_COOKIE_ALLOWLIST,
): string | undefined {
  const allowed = new Set(allowlist.map((name) => name.toLowerCase()));
  const parts: string[] = [];
  const seen = new Set<string>();

  for (const cookie of cookies) {
    const key = cookie.name.toLowerCase();
    if (!allowed.has(key)) continue;
    if (seen.has(key)) continue;
    if (!cookie.value) continue;
    seen.add(key);
    // name=value only; do not re-emit attributes
    parts.push(`${cookie.name}=${cookie.value}`);
  }

  return parts.length > 0 ? parts.join("; ") : undefined;
}

/**
 * Read a single allowlisted cookie value (first match).
 */
export function getAllowlistedCookieValue(
  cookies: Iterable<CookiePair>,
  name: string = SESSION_COOKIE_NAME,
): string | undefined {
  const target = name.toLowerCase();
  for (const cookie of cookies) {
    if (cookie.name.toLowerCase() === target && cookie.value) {
      return cookie.value;
    }
  }
  return undefined;
}

/**
 * Pick only allowlisted headers from an incoming Headers / record.
 * Does not invent values; caller supplies request-id when missing.
 */
export function pickForwardedRequestHeaders(
  incoming:
    | Headers
    | Record<string, string | null | undefined>
    | Iterable<[string, string]>,
  allowlist: readonly string[] = FORWARDED_HEADER_ALLOWLIST,
): Headers {
  const out = new Headers();
  const allowed = new Set(allowlist.map((h) => h.toLowerCase()));

  const apply = (name: string, value: string | null | undefined) => {
    if (value == null || value === "") return;
    const key = name.toLowerCase();
    if (!allowed.has(key)) return;
    // Preserve canonical OpenAPI casing for known headers
    if (key === "x-request-id") {
      out.set("X-Request-ID", value);
    } else {
      out.set(name, value);
    }
  };

  if (typeof (incoming as Headers).get === "function") {
    const headers = incoming as Headers;
    for (const name of allowlist) {
      apply(name, headers.get(name));
    }
    return out;
  }

  if (Symbol.iterator in Object(incoming) && !Array.isArray(incoming)) {
    // Iterable of pairs (e.g. headers.entries()) — already handled via Headers
  }

  if (Array.isArray(incoming)) {
    for (const [name, value] of incoming as Iterable<[string, string]>) {
      apply(name, value);
    }
    return out;
  }

  for (const [name, value] of Object.entries(
    incoming as Record<string, string | null | undefined>,
  )) {
    apply(name, value);
  }
  return out;
}

/**
 * True when a cookie name is on the SSR forward allowlist.
 */
export function isForwardableCookieName(
  name: string,
  allowlist: readonly string[] = FORWARDED_COOKIE_ALLOWLIST,
): boolean {
  const key = name.toLowerCase();
  return allowlist.some((item) => item.toLowerCase() === key);
}
