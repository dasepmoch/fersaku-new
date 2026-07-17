/**
 * AUT-100 — map auth transport/errors to AuthForm field regions (no new UI).
 * Password must never appear in mapped diagnostics or returned structures.
 */

import { ApiError } from "@/shared/api/api-error";
import { classifyThrown } from "@/shared/api/error-policy";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import type { AuthLoginDataDto } from "@/shared/api/schemas";
import {
  resolvePostLoginPath,
  sanitizeReturnToForSurface,
} from "@/shared/auth/return-to";
import type {
  SellerAuthField,
  SellerAuthFieldError,
  SellerForgotPasswordRequest,
  SellerLoginRequest,
  SellerLoginResult,
  SellerRegisterRequest,
  SellerRegisterResult,
  SellerForgotPasswordResult,
} from "./contracts";

const GENERIC_INVALID =
  "Email atau password tidak valid. Periksa kembali dan coba lagi.";
const GENERIC_UNVERIFIED =
  "Email atau password tidak valid. Periksa kembali dan coba lagi.";
const GENERIC_REGISTER_OK =
  "If the email is eligible, a verification message has been sent";
const GENERIC_FORGOT_OK =
  "If an account exists for that email, a reset message has been sent";

const FIELD_ALIASES: Record<string, SellerAuthField> = {
  name: "name",
  fullName: "name",
  full_name: "name",
  displayName: "name",
  display_name: "name",
  email: "email",
  password: "password",
  newPassword: "password",
  new_password: "password",
};

/** Build exact register DTO — never pass full form/view state. */
export function toSellerRegisterRequest(input: {
  email: string;
  password: string;
  name?: string;
}): SellerRegisterRequest {
  return {
    email: input.email.trim().toLowerCase(),
    password: input.password,
    name: (input.name ?? "").trim(),
    surface: "SELLER",
  };
}

/** Build exact login DTO. */
export function toSellerLoginRequest(input: {
  email: string;
  password: string;
}): SellerLoginRequest {
  return {
    email: input.email.trim().toLowerCase(),
    password: input.password,
    surface: "SELLER",
  };
}

export function toSellerForgotPasswordRequest(input: {
  email: string;
}): SellerForgotPasswordRequest {
  return { email: input.email.trim().toLowerCase() };
}

/**
 * Safe post-login path: allowlisted returnTo under /dashboard, else home.
 * Prefer onboarding when caller signals first-store path (register mock only).
 */
export function resolveSellerPostAuthPath(options?: {
  returnTo?: string | null;
  preferOnboarding?: boolean;
}): string {
  const safe = sanitizeReturnToForSurface(options?.returnTo, "seller");
  if (safe) return safe;
  if (options?.preferOnboarding) return "/dashboard/onboarding";
  return resolvePostLoginPath("seller", null);
}

export function mapLoginDataToResult(
  data: AuthLoginDataDto,
  returnTo?: string | null,
): Extract<SellerLoginResult, { ok: true }> {
  if (data.mfaRequired) {
    return {
      ok: true,
      kind: "mfa_pending",
      mfaRequired: true,
      csrfToken: data.csrfToken,
    };
  }
  return {
    ok: true,
    kind: "authenticated",
    mfaRequired: false,
    csrfToken: data.csrfToken,
    redirectTo: resolveSellerPostAuthPath({ returnTo }),
  };
}

function mapFieldName(raw: string): SellerAuthField | null {
  const key = raw.replace(/^body\./, "").replace(/^data\./, "");
  const leaf = key.includes(".") ? (key.split(".").pop() ?? key) : key;
  return FIELD_ALIASES[leaf] ?? FIELD_ALIASES[leaf.toLowerCase()] ?? null;
}

export function mapFieldViolationsToAuthFields(
  violations: Array<{ field: string; code: string; message?: string }>,
): SellerAuthFieldError[] {
  const out: SellerAuthFieldError[] = [];
  const seen = new Set<SellerAuthField>();
  for (const v of violations) {
    const field = mapFieldName(v.field);
    if (!field || seen.has(field)) continue;
    seen.add(field);
    out.push({
      field,
      message: v.message?.trim() || defaultFieldMessage(field, v.code),
    });
  }
  return out;
}

function defaultFieldMessage(field: SellerAuthField, code: string): string {
  if (field === "email") return "Masukkan email yang valid";
  if (field === "name") return "Nama terlalu pendek";
  if (code) return "Minimal 8 karakter";
  return "Minimal 8 karakter";
}

/**
 * Map thrown auth errors onto AuthForm field region or blocked (no new surface).
 * Never includes password/token in returned messages from raw body dumps.
 */
export function mapSellerAuthThrown(
  error: unknown,
  context: "login" | "register" | "forgot",
):
  | { kind: "field_errors"; fields: SellerAuthFieldError[] }
  | { kind: "generic"; message: string; code: string | null }
  | { kind: "blocked"; code: string | null } {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);

    if (
      code === PROBLEM_CODES.VALIDATION_FAILED ||
      classified.kind === "form_field_violations"
    ) {
      const fields = mapFieldViolationsToAuthFields(classified.fieldViolations);
      if (fields.length > 0) {
        return { kind: "field_errors", fields };
      }
      return {
        kind: "field_errors",
        fields: [{ field: "email", message: GENERIC_INVALID }],
      };
    }

    if (code === PROBLEM_CODES.AUTH_INVALID_CREDENTIALS) {
      return {
        kind: "field_errors",
        fields: [{ field: "password", message: GENERIC_INVALID }],
      };
    }

    // Email not verified / account inactive — anti-enumeration generic on field region.
    if (code === PROBLEM_CODES.FORBIDDEN || error.status === 403) {
      if (context === "login") {
        return {
          kind: "field_errors",
          fields: [{ field: "password", message: GENERIC_UNVERIFIED }],
        };
      }
      // Register: BE already anti-enumerates success; unexpected 403 → field generic.
      return {
        kind: "field_errors",
        fields: [{ field: "email", message: GENERIC_INVALID }],
      };
    }

    if (
      classified.kind === "rate_limited" ||
      classified.kind === "retry_safe_get" ||
      classified.kind === "transport_failure" ||
      classified.kind === "mutation_unknown" ||
      code === PROBLEM_CODES.RATE_LIMITED ||
      code === PROBLEM_CODES.SERVICE_UNAVAILABLE ||
      code === PROBLEM_CODES.PROVIDER_UNAVAILABLE
    ) {
      // No AuthForm surface for 429/unavailable (UXE-011) — do not fake success.
      return { kind: "blocked", code };
    }

    if (context === "forgot") {
      // Forgot always prefers generic success when response is processable;
      // hard failures stay blocked without inventing panels.
      return { kind: "blocked", code };
    }

    return {
      kind: "field_errors",
      fields: [
        {
          field: context === "register" ? "email" : "password",
          message: GENERIC_INVALID,
        },
      ],
    };
  }

  return { kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapRegisterThrown(error: unknown): SellerRegisterResult {
  const mapped = mapSellerAuthThrown(error, "register");
  if (mapped.kind === "field_errors") {
    return { ok: false, kind: "field_errors", fields: mapped.fields };
  }
  if (mapped.kind === "blocked") {
    return { ok: false, kind: "blocked", code: mapped.code };
  }
  return {
    ok: false,
    kind: "generic",
    message: mapped.message,
    code: mapped.code,
  };
}

export function mapLoginThrown(error: unknown): SellerLoginResult {
  const mapped = mapSellerAuthThrown(error, "login");
  if (mapped.kind === "field_errors") {
    return { ok: false, kind: "field_errors", fields: mapped.fields };
  }
  if (mapped.kind === "blocked") {
    return { ok: false, kind: "blocked", code: mapped.code };
  }
  return {
    ok: false,
    kind: "generic",
    message: mapped.message,
    code: mapped.code,
  };
}

export function mapForgotThrown(error: unknown): SellerForgotPasswordResult {
  const mapped = mapSellerAuthThrown(error, "forgot");
  if (mapped.kind === "field_errors") {
    return { ok: false, kind: "field_errors", fields: mapped.fields };
  }
  return { ok: false, kind: "blocked", code: mapped.code };
}

export function registerSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_REGISTER_OK;
}

export function forgotSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_FORGOT_OK;
}

/**
 * Guard: mutation/query keys must never embed password or raw secrets.
 */
export function assertAuthMutationKeySafe(key: readonly unknown[]): void {
  const flat = JSON.stringify(key);
  // Reject secret material in keys (not the word "forgot" operation name).
  if (
    /passwd|pwd|secret|csrf|token|"password"|'password'|password\s*:/i.test(
      flat,
    ) ||
    /password\d|password_value|userPassword/i.test(flat)
  ) {
    throw new Error("Auth mutation key must not contain secrets");
  }
  // Explicit: never put password field values into keys.
  for (const part of key) {
    if (part && typeof part === "object") {
      if (objectContainsPasswordLeak(part)) {
        throw new Error("Auth mutation key must not contain secrets");
      }
    }
    if (typeof part === "string" && /^password$/i.test(part)) {
      throw new Error("Auth mutation key must not contain secrets");
    }
  }
}

/**
 * Deep-scan plain objects for password-like keys (unit tests / guards).
 */
export function objectContainsPasswordLeak(value: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (node == null) return false;
    if (typeof node !== "object") return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/password|passwd|pwd/i.test(k)) {
        if (typeof v === "string" && v.length > 0) return true;
      }
      if (walk(v)) return true;
    }
    return false;
  };
  return walk(value);
}
