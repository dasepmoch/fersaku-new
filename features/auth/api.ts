/**
 * AUT-100 — seller auth transport (register/login/forgot/logout).
 * Mock only when domain auth is mock; API never invents session identity.
 */

import { apiRequest } from "@/shared/api/http-client";
import {
  authLoginEnvelopeSchema,
  authMessageEnvelopeSchema,
  type AuthLoginDataDto,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
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
  SellerForgotPasswordRequest,
  SellerForgotPasswordResult,
  SellerLoginRequest,
  SellerLoginResult,
  SellerLogoutResult,
  SellerRegisterRequest,
  SellerRegisterResult,
} from "./contracts";
import {
  forgotSuccessMessage,
  mapForgotThrown,
  mapLoginDataToResult,
  mapLoginThrown,
  mapRegisterThrown,
  registerSuccessMessage,
  resolveSellerPostAuthPath,
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
