/**
 * SEL-110 — store slug normalization aligned with backend stores.NormalizeSlug.
 */

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "www",
  "fersaku",
  "app",
  "dashboard",
  "seller",
  "buyer",
  "support",
  "help",
  "static",
  "assets",
  "null",
  "undefined",
  "me",
  "status",
  "health",
  "v1",
  "login",
  "register",
  "onboarding",
  "stores",
  "store",
  "public",
]);

const SLUG_MIN = 3;
const SLUG_MAX = 63;
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Lowercase, map invalid runes to '-', collapse hyphens, trim edges. */
export function normalizeStoreSlug(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
    } else if (ch === "-" || ch === "_" || ch === " " || /\s/.test(ch)) {
      out += "-";
    } else if (code > 127) {
      continue;
    } else {
      out += "-";
    }
  }
  out = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return out;
}

export function isReservedStoreSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Length, shape, reserved — mirrors ValidateNormalizedSlug. */
export function validateNormalizedStoreSlug(
  slug: string,
): "ok" | "invalid" | "reserved" {
  if (!slug) return "invalid";
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return "invalid";
  if (!SLUG_SHAPE.test(slug)) return "invalid";
  if (isReservedStoreSlug(slug)) return "reserved";
  return "ok";
}

export function normalizeAndValidateStoreSlug(raw: string): {
  slug: string;
  valid: boolean;
  reason?: "invalid" | "reserved";
} {
  const slug = normalizeStoreSlug(raw);
  const result = validateNormalizedStoreSlug(slug);
  if (result === "ok") return { slug, valid: true };
  return { slug, valid: false, reason: result };
}
