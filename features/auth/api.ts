/**
 * AUT-100/AUT-110/AUT-120 — seller + buyer + shared security ceremony transport.
 * Mock only when domain auth is mock; API never invents session identity.
 * Bootstrap tokens only in POST body (never query/path/storage).
 * MFA secrets/recovery codes: component memory only (no RQ cache).
 */

import { apiRequest } from "@/shared/api/http-client";
import {
  authEmailChangeConfirmEnvelopeSchema,
  authLoginEnvelopeSchema,
  authMessageEnvelopeSchema,
  authMfaEnrollEnvelopeSchema,
  authMfaRecoveryEnvelopeSchema,
  authMfaVerifyEnvelopeSchema,
  authPasswordChangeEnvelopeSchema,
  type AuthLoginDataDto,
  type AuthMfaEnrollDataDto,
  type AuthMfaRecoveryDataDto,
  type AuthMfaVerifyDataDto,
  type AuthPasswordChangeDataDto,
  type AuthEmailChangeConfirmDataDto,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { setRecentMfaProof } from "@/shared/api/recent-mfa-proof";
import {
  DomainDisabledError,
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import {
  applyLoginCsrf,
  logoutSession,
  refreshSessionAfterLogin,
} from "@/shared/auth";
import type {
  AdminLoginRequest,
  AdminLoginResult,
  AdminLogoutResult,
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
  SellerForgotPasswordRequest,
  SellerForgotPasswordResult,
  SellerLoginRequest,
  SellerLoginResult,
  SellerLogoutResult,
  SellerRegisterRequest,
  SellerRegisterResult,
  VerifyEmailRequest,
  VerifyEmailResult,
} from "./contracts";
import {
  emailChangeConfirmSuccessMessage,
  emailChangeRequestSuccessMessage,
  forgotSuccessMessage,
  magicLinkRequestSuccessMessage,
  mapAdminLoginDataToResult,
  mapAdminLoginThrown,
  mapEmailChangeConfirmData,
  mapEmailChangeConfirmThrown,
  mapEmailChangeRequestThrown,
  mapForgotThrown,
  mapLoginDataToResult,
  mapLoginThrown,
  mapMagicLinkConsumeData,
  mapMagicLinkConsumeThrown,
  mapMagicLinkRequestThrown,
  mapMfaConfirmThrown,
  mapMfaDisableThrown,
  mapMfaEnrollData,
  mapMfaEnrollThrown,
  mapMfaRecoveryData,
  mapMfaRegenerateThrown,
  mapMfaStepUpData,
  mapMfaStepUpThrown,
  mapMfaVerifyData,
  mapMfaVerifyThrown,
  mapPasswordChangeData,
  mapPasswordChangeThrown,
  mapPasswordResetThrown,
  mapRegisterThrown,
  mapVerifyEmailThrown,
  mfaDisableSuccessMessage,
  passwordChangeSuccessMessage,
  registerSuccessMessage,
  resetSuccessMessage,
  resolveAdminPostAuthPath,
  resolveSellerPostAuthPath,
  verifyEmailSuccessMessage,
} from "./mappers";

function assertAuthEnabled(): void {
  if (getDomainSource("auth") === "disabled") {
    throw new DomainDisabledError("auth");
  }
}

/**
 * POST /v1/auth/register — generic success (anti-enumeration).
 * Does not create a session; caller must not treat as logged-in.
 */
export async function registerSeller(
  input: SellerRegisterRequest,
  signal?: AbortSignal,
): Promise<SellerRegisterResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "registered",
        message: registerSuccessMessage(),
      };
    }
    const response = await apiRequest<
      ApiEnvelope<{ message: string }>,
      SellerRegisterRequest
    >("/v1/auth/register", {
      method: "POST",
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
        surface: input.surface,
      },
      schema: authMessageEnvelopeSchema,
      skipCsrf: true,
      signal,
    });
    return {
      ok: true,
      kind: "registered",
      message: registerSuccessMessage(response.data.message),
    };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapRegisterThrown(error);
  }
}

/**
 * POST /v1/auth/login — session cookie + CSRF; MFA_PENDING is not full success.
 */
export async function loginSeller(
  input: SellerLoginRequest,
  options?: { returnTo?: string | null; signal?: AbortSignal },
): Promise<SellerLoginResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, options?.signal);
      applyLoginCsrf(undefined);
      await refreshSessionAfterLogin("seller");
      return {
        ok: true,
        kind: "authenticated",
        mfaRequired: false,
        csrfToken: undefined,
        redirectTo: resolveSellerPostAuthPath({
          returnTo: options?.returnTo,
        }),
      };
    }

    const response = await apiRequest<
      ApiEnvelope<AuthLoginDataDto>,
      SellerLoginRequest
    >("/v1/auth/login", {
      method: "POST",
      body: {
        email: input.email,
        password: input.password,
        surface: input.surface,
      },
      schema: authLoginEnvelopeSchema,
      skipCsrf: true,
      signal: options?.signal,
    });

    const mapped = mapLoginDataToResult(response.data, options?.returnTo);
    applyLoginCsrf(mapped.csrfToken);

    if (mapped.kind === "mfa_pending") {
      // Session cookie may exist as MFA_PENDING — bootstrap claims; never dashboard.
      await refreshSessionAfterLogin("seller");
      return mapped;
    }

    await refreshSessionAfterLogin("seller");
    return mapped;
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapLoginThrown(error);
  }
}

/**
 * POST /v1/auth/password/forgot — always generic success when transport ok.
 */
export async function forgotSellerPassword(
  input: SellerForgotPasswordRequest,
  signal?: AbortSignal,
): Promise<SellerForgotPasswordResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "generic_sent",
        message: forgotSuccessMessage(),
      };
    }
    const response = await apiRequest<
      ApiEnvelope<{ message: string }>,
      SellerForgotPasswordRequest
    >("/v1/auth/password/forgot", {
      method: "POST",
      body: { email: input.email },
      schema: authMessageEnvelopeSchema,
      skipCsrf: true,
      signal,
    });
    return {
      ok: true,
      kind: "generic_sent",
      message: forgotSuccessMessage(response.data.message),
    };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapForgotThrown(error);
  }
}

/** Logout via shared session store (server revoke + private cache clear). */
export async function logoutSeller(): Promise<SellerLogoutResult> {
  const { loginHref } = await logoutSession({
    surface: "seller",
    redirect: true,
  });
  return { ok: true, loginHref };
}

/**
 * POST /v1/auth/login surface=ADMIN — session cookie + CSRF; MFA_PENDING is not console-ready.
 * ADM-100: mock fixtures only when domain auth is mock; API never invents admin identity.
 */
export async function loginAdmin(
  input: AdminLoginRequest,
  options?: { returnTo?: string | null; signal?: AbortSignal },
): Promise<AdminLoginResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, options?.signal);
      applyLoginCsrf(undefined);
      await refreshSessionAfterLogin("admin");
      return {
        ok: true,
        kind: "authenticated",
        mfaRequired: false,
        csrfToken: undefined,
        redirectTo: resolveAdminPostAuthPath({
          returnTo: options?.returnTo,
        }),
      };
    }

    const response = await apiRequest<
      ApiEnvelope<AuthLoginDataDto>,
      AdminLoginRequest
    >("/v1/auth/login", {
      method: "POST",
      body: {
        email: input.email,
        password: input.password,
        surface: input.surface,
      },
      schema: authLoginEnvelopeSchema,
      skipCsrf: true,
      signal: options?.signal,
    });

    const mapped = mapAdminLoginDataToResult(response.data, options?.returnTo);
    applyLoginCsrf(mapped.csrfToken);

    // MFA_PENDING or full auth: bootstrap claims; never treat MFA as console-ready.
    await refreshSessionAfterLogin("admin");
    return mapped;
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapAdminLoginThrown(error);
  }
}

/** Logout admin surface via shared session store. */
export async function logoutAdmin(): Promise<AdminLogoutResult> {
  const { loginHref } = await logoutSession({
    surface: "admin",
    redirect: true,
  });
  return { ok: true, loginHref };
}

/**
 * POST /v1/auth/magic-link/request — always generic success (anti-enumeration).
 * Does not create a session; does not reveal whether email exists.
 */
export async function requestBuyerMagicLink(
  input: BuyerMagicLinkRequest,
  signal?: AbortSignal,
): Promise<BuyerMagicLinkRequestResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "generic_sent",
        message: magicLinkRequestSuccessMessage(),
      };
    }
    const response = await apiRequest<
      ApiEnvelope<{ message: string }>,
      BuyerMagicLinkRequest
    >("/v1/auth/magic-link/request", {
      method: "POST",
      body: { email: input.email },
      schema: authMessageEnvelopeSchema,
      skipCsrf: true,
      signal,
    });
    return {
      ok: true,
      kind: "generic_sent",
      message: magicLinkRequestSuccessMessage(response.data.message),
    };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMagicLinkRequestThrown(error);
  }
}

/**
 * POST /v1/auth/magic-link/consume — one-time token in body only.
 * On success: apply CSRF + buyer session bootstrap, then safe returnTo.
 * Token must already be scrubbed from the URL by the caller.
 */
export async function consumeBuyerMagicLink(
  input: BuyerMagicLinkConsumeRequest,
  options?: { returnTo?: string | null; signal?: AbortSignal },
): Promise<BuyerMagicLinkConsumeResult> {
  assertAuthEnabled();
  const token = input.token.trim();
  if (!token) {
    return { ok: false, kind: "invalid_token", code: "AUTH_INVALID_TOKEN" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, options?.signal);
      applyLoginCsrf(undefined);
      await refreshSessionAfterLogin("buyer");
      return {
        ok: true,
        kind: "authenticated",
        csrfToken: undefined,
        redirectTo: mapMagicLinkConsumeData({}, options?.returnTo).redirectTo,
      };
    }

    const response = await apiRequest<
      ApiEnvelope<AuthLoginDataDto>,
      BuyerMagicLinkConsumeRequest
    >("/v1/auth/magic-link/consume", {
      method: "POST",
      body: { token },
      schema: authLoginEnvelopeSchema,
      skipCsrf: true,
      signal: options?.signal,
    });

    const mapped = mapMagicLinkConsumeData(response.data, options?.returnTo);
    applyLoginCsrf(mapped.csrfToken);
    await refreshSessionAfterLogin("buyer");
    return mapped;
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMagicLinkConsumeThrown(error);
  }
}

/**
 * POST /v1/auth/password/reset — fragment token + new password; anti-enumeration.
 * Token must already be scrubbed from the URL by the caller.
 */
export async function resetPassword(
  input: PasswordResetRequest,
  signal?: AbortSignal,
): Promise<PasswordResetResult> {
  assertAuthEnabled();
  const token = input.token.trim();
  if (!token) {
    return { ok: false, kind: "invalid_token", code: "AUTH_INVALID_TOKEN" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "reset",
        message: resetSuccessMessage(),
      };
    }
    const response = await apiRequest<
      ApiEnvelope<{ message: string }>,
      PasswordResetRequest
    >("/v1/auth/password/reset", {
      method: "POST",
      body: { token, newPassword: input.newPassword },
      schema: authMessageEnvelopeSchema,
      skipCsrf: true,
      signal,
    });
    return {
      ok: true,
      kind: "reset",
      message: resetSuccessMessage(response.data.message),
    };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapPasswordResetThrown(error);
  }
}

/**
 * POST /v1/auth/password/change — current password; may rotate CSRF/session.
 */
export async function changePassword(
  input: PasswordChangeRequest,
  signal?: AbortSignal,
): Promise<PasswordChangeResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "changed",
        message: passwordChangeSuccessMessage(),
        csrfToken: undefined,
      };
    }
    const body: PasswordChangeRequest = {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    };
    if (input.mfaCode) body.mfaCode = input.mfaCode;
    const response = await apiRequest<
      ApiEnvelope<AuthPasswordChangeDataDto>,
      PasswordChangeRequest
    >("/v1/auth/password/change", {
      method: "POST",
      body,
      schema: authPasswordChangeEnvelopeSchema,
      signal,
    });
    const mapped = mapPasswordChangeData(response.data);
    applyLoginCsrf(mapped.csrfToken);
    await refreshSessionAfterLogin();
    return mapped;
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapPasswordChangeThrown(error);
  }
}

/**
 * POST /v1/auth/email-change/request — dual-confirm start; generic message.
 */
export async function requestEmailChange(
  input: EmailChangeRequest,
  signal?: AbortSignal,
): Promise<EmailChangeRequestResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "generic_sent",
        message: emailChangeRequestSuccessMessage(),
      };
    }
    const response = await apiRequest<
      ApiEnvelope<{ message: string }>,
      EmailChangeRequest
    >("/v1/auth/email-change/request", {
      method: "POST",
      body: { newEmail: input.newEmail },
      schema: authMessageEnvelopeSchema,
      signal,
    });
    return {
      ok: true,
      kind: "generic_sent",
      message: emailChangeRequestSuccessMessage(response.data.message),
    };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapEmailChangeRequestThrown(error);
  }
}

/**
 * POST /v1/auth/email-change/confirm-current — fragment token exchange.
 */
export async function confirmEmailChangeCurrent(
  input: EmailChangeConfirmRequest,
  signal?: AbortSignal,
): Promise<EmailChangeConfirmResult> {
  return confirmEmailChange("/v1/auth/email-change/confirm-current", input, signal);
}

/**
 * POST /v1/auth/email-change/confirm-new — fragment token exchange.
 * On complete, BE revokes sessions; FE should clear local session.
 */
export async function confirmEmailChangeNew(
  input: EmailChangeConfirmRequest,
  signal?: AbortSignal,
): Promise<EmailChangeConfirmResult> {
  return confirmEmailChange("/v1/auth/email-change/confirm-new", input, signal);
}

async function confirmEmailChange(
  path: string,
  input: EmailChangeConfirmRequest,
  signal?: AbortSignal,
): Promise<EmailChangeConfirmResult> {
  assertAuthEnabled();
  const token = input.token.trim();
  if (!token) {
    return { ok: false, kind: "invalid_token", code: "AUTH_INVALID_TOKEN" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "confirmed",
        complete: path.endsWith("confirm-new"),
        message: emailChangeConfirmSuccessMessage(),
        newEmail: undefined,
      };
    }
    const response = await apiRequest<
      ApiEnvelope<AuthEmailChangeConfirmDataDto>,
      EmailChangeConfirmRequest
    >(path, {
      method: "POST",
      body: { token },
      schema: authEmailChangeConfirmEnvelopeSchema,
      skipCsrf: true,
      signal,
    });
    const mapped = mapEmailChangeConfirmData(response.data);
    if (mapped.complete) {
      // Sessions revoked server-side; clear private FE state without inventing UI.
      await logoutSession({ redirect: false }).catch(() => undefined);
    }
    return mapped;
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapEmailChangeConfirmThrown(error);
  }
}

/**
 * POST /v1/auth/mfa/verify — complete MFA_PENDING or mint optional recent proof.
 */
export async function verifyMfa(
  input: MfaVerifyRequest,
  options?: {
    returnTo?: string | null;
    surface?: "seller" | "admin";
    signal?: AbortSignal;
  },
): Promise<MfaVerifyResult> {
  assertAuthEnabled();
  const code = input.code.trim();
  if (!code) {
    return { ok: false, kind: "invalid_code", code: "AUTH_MFA_PROOF_INVALID" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, options?.signal);
      const surface = options?.surface ?? "seller";
      await refreshSessionAfterLogin(surface);
      return mapMfaVerifyData(
        { mfaVerified: true },
        { returnTo: options?.returnTo, surface },
      );
    }
    const body: MfaVerifyRequest = { code };
    if (input.purpose) body.purpose = input.purpose;
    const response = await apiRequest<
      ApiEnvelope<AuthMfaVerifyDataDto>,
      MfaVerifyRequest
    >("/v1/auth/mfa/verify", {
      method: "POST",
      body,
      schema: authMfaVerifyEnvelopeSchema,
      signal: options?.signal,
    });
    const surface = options?.surface ?? "seller";
    const mapped = mapMfaVerifyData(response.data, {
      returnTo: options?.returnTo,
      surface,
    });
    if (mapped.recentMfaProof) {
      setRecentMfaProof(mapped.recentMfaProof, {
        purpose: mapped.purpose,
        expiresAt: mapped.expiresAt,
      });
    }
    await refreshSessionAfterLogin(surface);
    return mapped;
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMfaVerifyThrown(error);
  }
}

/**
 * POST /v1/auth/mfa/step-up — mint purpose-scoped X-Recent-MFA-Proof (memory only).
 */
export async function stepUpMfa(
  input: MfaStepUpRequest,
  signal?: AbortSignal,
): Promise<MfaStepUpResult> {
  assertAuthEnabled();
  const code = input.code.trim();
  const purpose = input.purpose.trim();
  if (!code || !purpose) {
    return { ok: false, kind: "invalid_code", code: "AUTH_MFA_PROOF_INVALID" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      const mockProof = `mock-proof-${purpose}`;
      setRecentMfaProof(mockProof, {
        purpose,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      return {
        ok: true,
        kind: "proof",
        recentMfaProof: mockProof,
        purpose,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        factor: "totp",
      };
    }
    const response = await apiRequest<
      ApiEnvelope<AuthMfaVerifyDataDto>,
      MfaStepUpRequest
    >("/v1/auth/mfa/step-up", {
      method: "POST",
      body: { code, purpose },
      schema: authMfaVerifyEnvelopeSchema,
      signal,
    });
    const mapped = mapMfaStepUpData(response.data);
    if (mapped.ok) {
      setRecentMfaProof(mapped.recentMfaProof, {
        purpose: mapped.purpose,
        expiresAt: mapped.expiresAt,
      });
    }
    return mapped;
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMfaStepUpThrown(error);
  }
}

/**
 * POST /v1/auth/mfa/enroll — secret + otpauth once (caller holds in component memory).
 */
export async function enrollMfa(
  signal?: AbortSignal,
): Promise<MfaEnrollResult> {
  assertAuthEnabled();
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "enrolled",
        secret: "MOCKMFASECRET000",
        otpauthUrl:
          "otpauth://totp/Fersaku:mock@example.com?secret=MOCKMFASECRET000&issuer=Fersaku",
        factorId: "mock-factor",
      };
    }
    const response = await apiRequest<
      ApiEnvelope<AuthMfaEnrollDataDto>,
      undefined
    >("/v1/auth/mfa/enroll", {
      method: "POST",
      schema: authMfaEnrollEnvelopeSchema,
      signal,
    });
    return mapMfaEnrollData(response.data);
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMfaEnrollThrown(error);
  }
}

/**
 * POST /v1/auth/mfa/confirm — enables MFA; returns recovery codes once.
 */
export async function confirmMfa(
  input: MfaConfirmRequest,
  signal?: AbortSignal,
): Promise<MfaConfirmResult> {
  assertAuthEnabled();
  const code = input.code.trim();
  if (!code) {
    return { ok: false, kind: "invalid_code", code: "AUTH_MFA_PROOF_INVALID" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "confirmed",
        recoveryCodes: [
          "FRSK-A92K",
          "FRSK-J71P",
          "FRSK-Q04X",
          "FRSK-M88D",
          "FRSK-W31C",
          "FRSK-L52N",
        ],
      };
    }
    const response = await apiRequest<
      ApiEnvelope<AuthMfaRecoveryDataDto>,
      MfaConfirmRequest
    >("/v1/auth/mfa/confirm", {
      method: "POST",
      body: { code },
      schema: authMfaRecoveryEnvelopeSchema,
      signal,
    });
    const { recoveryCodes } = mapMfaRecoveryData(response.data);
    await refreshSessionAfterLogin();
    return { ok: true, kind: "confirmed", recoveryCodes };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMfaConfirmThrown(error);
  }
}

/**
 * POST /v1/auth/mfa/disable — requires fresh TOTP/recovery code.
 */
export async function disableMfa(
  input: MfaDisableRequest,
  signal?: AbortSignal,
): Promise<MfaDisableResult> {
  assertAuthEnabled();
  const code = input.code.trim();
  if (!code) {
    return { ok: false, kind: "invalid_code", code: "AUTH_MFA_PROOF_INVALID" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "disabled",
        message: mfaDisableSuccessMessage(),
      };
    }
    const response = await apiRequest<
      ApiEnvelope<{ message: string }>,
      MfaDisableRequest
    >("/v1/auth/mfa/disable", {
      method: "POST",
      body: { code },
      schema: authMessageEnvelopeSchema,
      signal,
    });
    await refreshSessionAfterLogin();
    return {
      ok: true,
      kind: "disabled",
      message: mfaDisableSuccessMessage(response.data.message),
    };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMfaDisableThrown(error);
  }
}

/**
 * POST /v1/auth/mfa/recovery-codes/regenerate — one-time new codes.
 */
export async function regenerateMfaRecoveryCodes(
  input: MfaRegenerateRecoveryRequest,
  signal?: AbortSignal,
): Promise<MfaRegenerateRecoveryResult> {
  assertAuthEnabled();
  const code = input.code.trim();
  if (!code) {
    return { ok: false, kind: "invalid_code", code: "AUTH_MFA_PROOF_INVALID" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "regenerated",
        recoveryCodes: [
          "FRSK-R01A",
          "FRSK-R02B",
          "FRSK-R03C",
          "FRSK-R04D",
          "FRSK-R05E",
          "FRSK-R06F",
        ],
      };
    }
    const response = await apiRequest<
      ApiEnvelope<AuthMfaRecoveryDataDto>,
      MfaRegenerateRecoveryRequest
    >("/v1/auth/mfa/recovery-codes/regenerate", {
      method: "POST",
      body: { code },
      schema: authMfaRecoveryEnvelopeSchema,
      signal,
    });
    const { recoveryCodes } = mapMfaRecoveryData(response.data);
    return { ok: true, kind: "regenerated", recoveryCodes };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapMfaRegenerateThrown(error);
  }
}

/**
 * POST /v1/auth/verify-email — fragment token exchange (shared ceremony).
 */
export async function verifyEmail(
  input: VerifyEmailRequest,
  signal?: AbortSignal,
): Promise<VerifyEmailResult> {
  assertAuthEnabled();
  const token = input.token.trim();
  if (!token) {
    return { ok: false, kind: "invalid_token", code: "AUTH_INVALID_TOKEN" };
  }
  try {
    if (shouldUseMockFixtures("auth")) {
      await delay(200, signal);
      return {
        ok: true,
        kind: "verified",
        message: verifyEmailSuccessMessage(),
      };
    }
    const response = await apiRequest<
      ApiEnvelope<{ message: string }>,
      VerifyEmailRequest
    >("/v1/auth/verify-email", {
      method: "POST",
      body: { token },
      schema: authMessageEnvelopeSchema,
      skipCsrf: true,
      signal,
    });
    return {
      ok: true,
      kind: "verified",
      message: verifyEmailSuccessMessage(response.data.message),
    };
  } catch (error) {
    if (error instanceof DomainDisabledError) {
      return { ok: false, kind: "blocked", code: "DOMAIN_DISABLED" };
    }
    return mapVerifyEmailThrown(error);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
