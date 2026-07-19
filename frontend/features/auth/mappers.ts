/**
 * AUT-100/AUT-110 — map auth transport/errors to existing form regions (no new UI).
 * Password/magic tokens must never appear in mapped diagnostics or returned structures.
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
  AdminAuthField,
  AdminAuthFieldError,
  AdminLoginRequest,
  AdminLoginResult,
  BuyerMagicLinkConsumeRequest,
  BuyerMagicLinkConsumeResult,
  BuyerMagicLinkRequest,
  BuyerMagicLinkRequestResult,
  EmailChangeConfirmRequest,
  EmailChangeConfirmResult,
  EmailChangeRequest,
  EmailChangeRequestResult,
  MfaConfirmRequest,
  MfaConfirmResult,
  MfaDisableRequest,
  MfaDisableResult,
  MfaEnrollResult,
  MfaRegenerateRecoveryRequest,
  MfaRegenerateRecoveryResult,
  MfaStepUpRequest,
  MfaStepUpResult,
  MfaVerifyRequest,
  MfaVerifyResult,
  PasswordChangeRequest,
  PasswordChangeResult,
  PasswordResetRequest,
  PasswordResetResult,
  SellerAuthField,
  SellerAuthFieldError,
  SellerForgotPasswordRequest,
  SellerLoginRequest,
  SellerLoginResult,
  SellerRegisterRequest,
  SellerRegisterResult,
  SellerForgotPasswordResult,
  VerifyEmailRequest,
  VerifyEmailResult,
} from "./contracts";
import type {
  AuthEmailChangeConfirmDataDto,
  AuthMfaEnrollDataDto,
  AuthMfaRecoveryDataDto,
  AuthMfaVerifyDataDto,
  AuthPasswordChangeDataDto,
} from "@/shared/api/schemas";

const GENERIC_INVALID =
  "Email atau password tidak valid. Periksa kembali dan coba lagi.";
const GENERIC_UNVERIFIED =
  "Email atau password tidak valid. Periksa kembali dan coba lagi.";
const GENERIC_REGISTER_OK =
  "If the email is eligible, a verification message has been sent";
const GENERIC_FORGOT_OK =
  "If an account exists for that email, a reset message has been sent";
const GENERIC_MAGIC_LINK_OK =
  "If an account exists for that email, a sign-in link has been sent";
const GENERIC_RESET_OK = "Password has been updated. Sign in with your new password.";
const GENERIC_PASSWORD_CHANGED = "Password updated";
const GENERIC_EMAIL_CHANGE_OK =
  "If the request is valid, confirmation messages have been sent";
const GENERIC_EMAIL_CONFIRMED = "Email change confirmed";
const GENERIC_VERIFY_EMAIL_OK = "Email verified";
const GENERIC_MFA_DISABLED = "MFA disabled";
const GENERIC_INVALID_CODE = "Kode tidak valid. Coba lagi.";
const GENERIC_INVALID_TOKEN =
  "Link tidak valid atau sudah kedaluwarsa. Minta ulang bila perlu.";

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

/** Build exact admin login DTO (ADM-100). */
export function toAdminLoginRequest(input: {
  email: string;
  password: string;
}): AdminLoginRequest {
  return {
    email: input.email.trim().toLowerCase(),
    password: input.password,
    surface: "ADMIN",
  };
}

export function toSellerForgotPasswordRequest(input: {
  email: string;
}): SellerForgotPasswordRequest {
  return { email: input.email.trim().toLowerCase() };
}

/** Build exact magic-link request DTO (buyer). */
export function toBuyerMagicLinkRequest(input: {
  email: string;
}): BuyerMagicLinkRequest {
  return { email: input.email.trim().toLowerCase() };
}

/**
 * Build consume DTO from opaque token only (never from query/path helpers).
 * Caller must obtain token from URL fragment and scrub before POST.
 */
export function toBuyerMagicLinkConsumeRequest(input: {
  token: string;
}): BuyerMagicLinkConsumeRequest {
  return { token: input.token.trim() };
}

/**
 * Parse `#token=<opaque>` from location.hash (or raw hash string).
 * Returns null when missing/empty — never reads query/path.
 */
export function parseMagicLinkFragmentToken(
  hash: string | null | undefined,
): string | null {
  if (hash == null) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  // Prefer URLSearchParams so `#token=a&x=b` and order variants work.
  try {
    const params = new URLSearchParams(raw);
    const fromParams = params.get("token");
    if (fromParams != null && fromParams.trim().length > 0) {
      return fromParams.trim();
    }
  } catch {
    // fall through
  }
  // Fallback: first `token=` segment without decoding secrets into logs.
  const match = /(?:^|&)token=([^&]*)/.exec(raw);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Strip hash from the current browser URL immediately (before any network).
 * Safe no-op on server / when history API unavailable.
 */
export function scrubUrlFragment(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  const next = `${pathname}${search}`;
  if (window.location.hash) {
    window.history.replaceState(
      window.history.state,
      "",
      next || pathname || "/",
    );
  }
}

/**
 * True when a bootstrap token appears in query/path (forbidden for AUT-110).
 * Fragment-only delivery is required.
 */
export function hasForbiddenTokenInLocation(input: {
  search?: string | null;
  pathname?: string | null;
}): boolean {
  const search = input.search ?? "";
  const pathname = input.pathname ?? "";
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (q) {
    try {
      const params = new URLSearchParams(q);
      const t = params.get("token");
      if (t != null && t.length > 0) return true;
    } catch {
      if (/(?:^|&)token=/i.test(q)) return true;
    }
  }
  // Path segment that looks like a long-lived opaque bootstrap (not /account/verify itself).
  if (/\/token\//i.test(pathname) || /\/magic-link\//i.test(pathname)) {
    return true;
  }
  return false;
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

/** Safe buyer post-magic-link path: allowlisted /account/*, else purchases. */
export function resolveBuyerPostAuthPath(options?: {
  returnTo?: string | null;
}): string {
  return resolvePostLoginPath("buyer", options?.returnTo ?? null);
}

/** Safe admin post-login path: allowlisted /admin/*, else /admin. */
export function resolveAdminPostAuthPath(options?: {
  returnTo?: string | null;
}): string {
  return resolvePostLoginPath("admin", options?.returnTo ?? null);
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

/** Map admin login response; MFA_PENDING never includes console redirect. */
export function mapAdminLoginDataToResult(
  data: AuthLoginDataDto,
  returnTo?: string | null,
): Extract<AdminLoginResult, { ok: true }> {
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
    redirectTo: resolveAdminPostAuthPath({ returnTo }),
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

/**
 * Admin login errors: reuse seller field mapping (email/password only).
 * No AdminLogin error region yet (UXE-011) — callers must not invent panels.
 */
export function mapAdminLoginThrown(error: unknown): AdminLoginResult {
  const mapped = mapSellerAuthThrown(error, "login");
  if (mapped.kind === "field_errors") {
    const fields: AdminAuthFieldError[] = mapped.fields
      .filter(
        (f): f is { field: AdminAuthField; message: string } =>
          f.field === "email" || f.field === "password",
      )
      .map((f) => ({ field: f.field, message: f.message }));
    if (fields.length === 0) {
      return {
        ok: false,
        kind: "field_errors",
        fields: [{ field: "password", message: GENERIC_INVALID }],
      };
    }
    return { ok: false, kind: "field_errors", fields };
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

/**
 * Magic-link request: generic success preferred; hard failures blocked (no new UI).
 * Never distinguishes unknown email (anti-enumeration).
 */
export function mapMagicLinkRequestThrown(
  error: unknown,
): BuyerMagicLinkRequestResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (
      classified.kind === "rate_limited" ||
      classified.kind === "retry_safe_get" ||
      classified.kind === "transport_failure" ||
      classified.kind === "mutation_unknown" ||
      code === PROBLEM_CODES.RATE_LIMITED ||
      code === PROBLEM_CODES.SERVICE_UNAVAILABLE ||
      code === PROBLEM_CODES.PROVIDER_UNAVAILABLE
    ) {
      return { ok: false, kind: "blocked", code };
    }
    // Unexpected 4xx still must not enumerate — treat as blocked (no sent state).
    return { ok: false, kind: "blocked", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

/**
 * Consume failures: invalid/expired/replay → invalid_token (NotFound path).
 * Rate-limit/transport → blocked (no fake success).
 * Never include token in message/code payload beyond problem code.
 */
export function mapMagicLinkConsumeThrown(
  error: unknown,
): BuyerMagicLinkConsumeResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (
      classified.kind === "rate_limited" ||
      classified.kind === "retry_safe_get" ||
      classified.kind === "transport_failure" ||
      classified.kind === "mutation_unknown" ||
      code === PROBLEM_CODES.RATE_LIMITED ||
      code === PROBLEM_CODES.SERVICE_UNAVAILABLE ||
      code === PROBLEM_CODES.PROVIDER_UNAVAILABLE
    ) {
      return { ok: false, kind: "blocked", code };
    }
    // 401/403/404 and auth invalid → generic invalid token (no account existence leak).
    return { ok: false, kind: "invalid_token", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapMagicLinkConsumeData(
  data: AuthLoginDataDto,
  returnTo?: string | null,
): Extract<BuyerMagicLinkConsumeResult, { ok: true }> {
  return {
    ok: true,
    kind: "authenticated",
    csrfToken: data.csrfToken,
    redirectTo: resolveBuyerPostAuthPath({ returnTo }),
  };
}

export function registerSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_REGISTER_OK;
}

export function forgotSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_FORGOT_OK;
}

export function magicLinkRequestSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_MAGIC_LINK_OK;
}

/**
 * Guard: mapped results / diagnostics must never embed raw magic-link token values.
 */
export function objectContainsMagicTokenLeak(
  value: unknown,
  rawToken: string,
): boolean {
  if (!rawToken || rawToken.length < 4) return false;
  const needle = rawToken;
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (node == null) return false;
    if (typeof node === "string") return node.includes(needle);
    if (typeof node !== "object") return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    for (const v of Object.values(node as Record<string, unknown>)) {
      if (walk(v)) return true;
    }
    return false;
  };
  return walk(value);
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

// --- AUT-120 builders ---

export function toPasswordResetRequest(input: {
  token: string;
  newPassword: string;
}): PasswordResetRequest {
  return {
    token: input.token.trim(),
    newPassword: input.newPassword,
  };
}

export function toPasswordChangeRequest(input: {
  currentPassword: string;
  newPassword: string;
  mfaCode?: string;
}): PasswordChangeRequest {
  const body: PasswordChangeRequest = {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  };
  const code = input.mfaCode?.trim();
  if (code) body.mfaCode = code;
  return body;
}

export function toEmailChangeRequest(input: {
  newEmail: string;
}): EmailChangeRequest {
  return { newEmail: input.newEmail.trim().toLowerCase() };
}

export function toEmailChangeConfirmRequest(input: {
  token: string;
}): EmailChangeConfirmRequest {
  return { token: input.token.trim() };
}

export function toMfaVerifyRequest(input: {
  code: string;
  purpose?: string;
}): MfaVerifyRequest {
  const body: MfaVerifyRequest = { code: input.code.trim() };
  const purpose = input.purpose?.trim();
  if (purpose) body.purpose = purpose;
  return body;
}

export function toMfaStepUpRequest(input: {
  code: string;
  purpose: string;
}): MfaStepUpRequest {
  return {
    code: input.code.trim(),
    purpose: input.purpose.trim(),
  };
}

export function toMfaConfirmRequest(input: { code: string }): MfaConfirmRequest {
  return { code: input.code.trim() };
}

export function toMfaDisableRequest(input: { code: string }): MfaDisableRequest {
  return { code: input.code.trim() };
}

export function toMfaRegenerateRecoveryRequest(input: {
  code: string;
}): MfaRegenerateRecoveryRequest {
  return { code: input.code.trim() };
}

export function toVerifyEmailRequest(input: {
  token: string;
}): VerifyEmailRequest {
  return { token: input.token.trim() };
}

/**
 * Alias for bootstrap tokens (reset / email-confirm / verify-email / invite).
 * Same fragment `#token=` contract as AUT-110 magic-link.
 */
export const parseAuthFragmentToken = parseMagicLinkFragmentToken;

export function resetSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_RESET_OK;
}

export function passwordChangeSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_PASSWORD_CHANGED;
}

export function emailChangeRequestSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_EMAIL_CHANGE_OK;
}

export function emailChangeConfirmSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_EMAIL_CONFIRMED;
}

export function verifyEmailSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_VERIFY_EMAIL_OK;
}

export function mfaDisableSuccessMessage(message?: string): string {
  return message?.trim() || GENERIC_MFA_DISABLED;
}

function isRateOrUnavailable(
  error: ApiError,
  classified: ReturnType<typeof classifyThrown>,
): boolean {
  const code = error.code;
  return (
    classified.kind === "rate_limited" ||
    classified.kind === "retry_safe_get" ||
    classified.kind === "transport_failure" ||
    classified.kind === "mutation_unknown" ||
    code === PROBLEM_CODES.RATE_LIMITED ||
    code === PROBLEM_CODES.SERVICE_UNAVAILABLE ||
    code === PROBLEM_CODES.PROVIDER_UNAVAILABLE
  );
}

export function mapPasswordResetThrown(error: unknown): PasswordResetResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    if (
      code === PROBLEM_CODES.VALIDATION_FAILED ||
      classified.kind === "form_field_violations"
    ) {
      const fields = mapFieldViolationsToAuthFields(classified.fieldViolations);
      if (fields.length > 0) {
        return { ok: false, kind: "field_errors", fields };
      }
    }
    return { ok: false, kind: "invalid_token", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapPasswordChangeThrown(error: unknown): PasswordChangeResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    if (
      code === PROBLEM_CODES.VALIDATION_FAILED ||
      classified.kind === "form_field_violations"
    ) {
      const fields = mapFieldViolationsToAuthFields(classified.fieldViolations);
      if (fields.length > 0) {
        return { ok: false, kind: "field_errors", fields };
      }
    }
    if (
      code === PROBLEM_CODES.AUTH_INVALID_CREDENTIALS ||
      code === PROBLEM_CODES.AUTH_MFA_REQUIRED ||
      code === PROBLEM_CODES.AUTH_MFA_PROOF_INVALID ||
      error.status === 401
    ) {
      return {
        ok: false,
        kind: "field_errors",
        fields: [
          {
            field: "password",
            message: GENERIC_INVALID,
          },
        ],
      };
    }
    return {
      ok: false,
      kind: "generic",
      message: GENERIC_INVALID,
      code,
    };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapPasswordChangeData(
  data: AuthPasswordChangeDataDto,
): Extract<PasswordChangeResult, { ok: true }> {
  return {
    ok: true,
    kind: "changed",
    message: passwordChangeSuccessMessage(data.message),
    csrfToken: data.csrfToken,
  };
}

export function mapEmailChangeRequestThrown(
  error: unknown,
): EmailChangeRequestResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    if (code === PROBLEM_CODES.CONFLICT || error.status === 409) {
      return { ok: false, kind: "conflict", code };
    }
    return { ok: false, kind: "blocked", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapEmailChangeConfirmThrown(
  error: unknown,
): EmailChangeConfirmResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    return { ok: false, kind: "invalid_token", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapEmailChangeConfirmData(
  data: AuthEmailChangeConfirmDataDto,
): Extract<EmailChangeConfirmResult, { ok: true }> {
  return {
    ok: true,
    kind: "confirmed",
    complete: Boolean(data.complete),
    message: emailChangeConfirmSuccessMessage(data.message),
    newEmail: data.newEmail,
  };
}

export function mapMfaVerifyThrown(error: unknown): MfaVerifyResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    return { ok: false, kind: "invalid_code", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapMfaVerifyData(
  data: AuthMfaVerifyDataDto,
  options?: { returnTo?: string | null; surface?: "seller" | "admin" },
): Extract<MfaVerifyResult, { ok: true }> {
  const surface = options?.surface ?? "seller";
  const redirectTo =
    surface === "admin"
      ? resolveAdminPostAuthPath({ returnTo: options?.returnTo })
      : resolveSellerPostAuthPath({ returnTo: options?.returnTo });
  return {
    ok: true,
    kind: "verified",
    recentMfaProof: data.recentMfaProof,
    purpose: data.purpose,
    expiresAt: data.expiresAt,
    factor: data.factor,
    redirectTo,
  };
}

export function mapMfaStepUpThrown(error: unknown): MfaStepUpResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    return { ok: false, kind: "invalid_code", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapMfaStepUpData(
  data: AuthMfaVerifyDataDto,
): Extract<MfaStepUpResult, { ok: true }> | Extract<MfaStepUpResult, { ok: false }> {
  const proof = data.recentMfaProof?.trim();
  if (!proof) {
    return { ok: false, kind: "blocked", code: "AUTH_MFA_PROOF_INVALID" };
  }
  return {
    ok: true,
    kind: "proof",
    recentMfaProof: proof,
    purpose: data.purpose?.trim() || "",
    expiresAt: data.expiresAt,
    factor: data.factor,
  };
}

export function mapMfaEnrollData(
  data: AuthMfaEnrollDataDto,
): Extract<MfaEnrollResult, { ok: true }> {
  return {
    ok: true,
    kind: "enrolled",
    secret: data.secret,
    otpauthUrl: data.otpauthUrl,
    factorId: data.factorId,
  };
}

export function mapMfaEnrollThrown(error: unknown): MfaEnrollResult {
  if (error instanceof ApiError) {
    return { ok: false, kind: "blocked", code: error.code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapMfaConfirmThrown(error: unknown): MfaConfirmResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    return { ok: false, kind: "invalid_code", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapMfaRecoveryData(
  data: AuthMfaRecoveryDataDto,
): { recoveryCodes: string[] } {
  return { recoveryCodes: [...data.recoveryCodes] };
}

export function mapMfaDisableThrown(error: unknown): MfaDisableResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    return { ok: false, kind: "invalid_code", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapMfaRegenerateThrown(
  error: unknown,
): MfaRegenerateRecoveryResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    return { ok: false, kind: "invalid_code", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

export function mapVerifyEmailThrown(error: unknown): VerifyEmailResult {
  if (error instanceof ApiError) {
    const code = error.code;
    const classified = classifyThrown(error);
    if (isRateOrUnavailable(error, classified)) {
      return { ok: false, kind: "blocked", code };
    }
    return { ok: false, kind: "invalid_token", code };
  }
  return { ok: false, kind: "blocked", code: "NETWORK_ERROR" };
}

/**
 * Guard: recovery codes / TOTP secret must not leak into mutation keys or logs.
 */
export function objectContainsMfaSecretLeak(
  value: unknown,
  rawSecret: string,
): boolean {
  if (!rawSecret || rawSecret.length < 4) return false;
  return objectContainsMagicTokenLeak(value, rawSecret);
}

export { GENERIC_INVALID_CODE, GENERIC_INVALID_TOKEN };
