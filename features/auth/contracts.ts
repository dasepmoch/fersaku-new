/**
 * AUT-100 — seller auth request/result contracts (exact DTO surface).
 * Password never enters query keys; keep secrets out of view-model dumps.
 */

export type SellerAuthSurface = "SELLER";

/** Exact POST /v1/auth/register body (seller). */
export type SellerRegisterRequest = {
  email: string;
  password: string;
  name: string;
  surface: SellerAuthSurface;
};

/** Exact POST /v1/auth/login body (seller). */
export type SellerLoginRequest = {
  email: string;
  password: string;
  surface: SellerAuthSurface;
};

/** Exact POST /v1/auth/password/forgot body. */
export type SellerForgotPasswordRequest = {
  email: string;
};

export type SellerAuthField = "name" | "email" | "password";

export type SellerAuthFieldError = {
  field: SellerAuthField;
  message: string;
};

export type SellerRegisterResult =
  | { ok: true; kind: "registered"; message: string }
  | { ok: false; kind: "field_errors"; fields: SellerAuthFieldError[] }
  | { ok: false; kind: "generic"; message: string; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

export type SellerLoginResult =
  | {
      ok: true;
      kind: "authenticated";
      mfaRequired: false;
      csrfToken: string | undefined;
      redirectTo: string;
    }
  | {
      ok: true;
      kind: "mfa_pending";
      mfaRequired: true;
      csrfToken: string | undefined;
    }
  | { ok: false; kind: "field_errors"; fields: SellerAuthFieldError[] }
  | { ok: false; kind: "generic"; message: string; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

export type SellerForgotPasswordResult =
  | { ok: true; kind: "generic_sent"; message: string }
  | { ok: false; kind: "field_errors"; fields: SellerAuthFieldError[] }
  | { ok: false; kind: "blocked"; code: string | null };

export type SellerLogoutResult = { ok: true; loginHref: string };

/** ADM-100 — admin auth surface on shared login transport. */
export type AdminAuthSurface = "ADMIN";

/** Exact POST /v1/auth/login body (admin). */
export type AdminLoginRequest = {
  email: string;
  password: string;
  surface: AdminAuthSurface;
};

export type AdminAuthField = "email" | "password";

export type AdminAuthFieldError = {
  field: AdminAuthField;
  message: string;
};

export type AdminLoginResult =
  | {
      ok: true;
      kind: "authenticated";
      mfaRequired: false;
      csrfToken: string | undefined;
      redirectTo: string;
    }
  | {
      ok: true;
      kind: "mfa_pending";
      mfaRequired: true;
      csrfToken: string | undefined;
    }
  | { ok: false; kind: "field_errors"; fields: AdminAuthFieldError[] }
  | { ok: false; kind: "generic"; message: string; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

export type AdminLogoutResult = { ok: true; loginHref: string };

/** Exact POST /v1/auth/magic-link/request body. */
export type BuyerMagicLinkRequest = {
  email: string;
};

/** Exact POST /v1/auth/magic-link/consume body (token from URL fragment only). */
export type BuyerMagicLinkConsumeRequest = {
  token: string;
};

export type BuyerMagicLinkRequestResult =
  | { ok: true; kind: "generic_sent"; message: string }
  | { ok: false; kind: "blocked"; code: string | null };

export type BuyerMagicLinkConsumeResult =
  | {
      ok: true;
      kind: "authenticated";
      csrfToken: string | undefined;
      redirectTo: string;
    }
  | { ok: false; kind: "invalid_token"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };
