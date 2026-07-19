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

// --- AUT-120 shared password / MFA / email ceremony ---

/** Exact POST /v1/auth/password/reset body (token from fragment only). */
export type PasswordResetRequest = {
  token: string;
  newPassword: string;
};

export type PasswordResetResult =
  | { ok: true; kind: "reset"; message: string }
  | { ok: false; kind: "invalid_token"; code: string | null }
  | { ok: false; kind: "field_errors"; fields: SellerAuthFieldError[] }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/password/change body. */
export type PasswordChangeRequest = {
  currentPassword: string;
  newPassword: string;
  mfaCode?: string;
};

export type PasswordChangeResult =
  | {
      ok: true;
      kind: "changed";
      message: string;
      csrfToken: string | undefined;
    }
  | { ok: false; kind: "field_errors"; fields: SellerAuthFieldError[] }
  | { ok: false; kind: "generic"; message: string; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/email-change/request body. */
export type EmailChangeRequest = {
  newEmail: string;
};

export type EmailChangeRequestResult =
  | { ok: true; kind: "generic_sent"; message: string }
  | { ok: false; kind: "conflict"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST email-change confirm-* body (token from fragment only). */
export type EmailChangeConfirmRequest = {
  token: string;
};

export type EmailChangeConfirmResult =
  | {
      ok: true;
      kind: "confirmed";
      complete: boolean;
      message: string;
      newEmail: string | undefined;
    }
  | { ok: false; kind: "invalid_token"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/mfa/verify body. */
export type MfaVerifyRequest = {
  code: string;
  purpose?: string;
};

export type MfaVerifyResult =
  | {
      ok: true;
      kind: "verified";
      recentMfaProof: string | undefined;
      purpose: string | undefined;
      expiresAt: string | undefined;
      factor: string | undefined;
      redirectTo: string | undefined;
    }
  | { ok: false; kind: "invalid_code"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/mfa/step-up body (purpose required). */
export type MfaStepUpRequest = {
  code: string;
  purpose: string;
};

export type MfaStepUpResult =
  | {
      ok: true;
      kind: "proof";
      recentMfaProof: string;
      purpose: string;
      expiresAt: string | undefined;
      factor: string | undefined;
    }
  | { ok: false; kind: "invalid_code"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

export type MfaEnrollResult =
  | {
      ok: true;
      kind: "enrolled";
      secret: string;
      otpauthUrl: string;
      factorId: string | undefined;
    }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/mfa/confirm body. */
export type MfaConfirmRequest = {
  code: string;
};

export type MfaConfirmResult =
  | { ok: true; kind: "confirmed"; recoveryCodes: string[] }
  | { ok: false; kind: "invalid_code"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/mfa/disable body. */
export type MfaDisableRequest = {
  code: string;
};

export type MfaDisableResult =
  | { ok: true; kind: "disabled"; message: string }
  | { ok: false; kind: "invalid_code"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/mfa/recovery-codes/regenerate body. */
export type MfaRegenerateRecoveryRequest = {
  code: string;
};

export type MfaRegenerateRecoveryResult =
  | { ok: true; kind: "regenerated"; recoveryCodes: string[] }
  | { ok: false; kind: "invalid_code"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };

/** Exact POST /v1/auth/verify-email body (token from fragment only). */
export type VerifyEmailRequest = {
  token: string;
};

export type VerifyEmailResult =
  | { ok: true; kind: "verified"; message: string }
  | { ok: false; kind: "invalid_token"; code: string | null }
  | { ok: false; kind: "blocked"; code: string | null };
