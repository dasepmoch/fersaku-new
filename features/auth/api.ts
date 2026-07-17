/**
 * AUT-100/AUT-110 — seller + buyer auth transport.
 * Mock only when domain auth is mock; API never invents session identity.
 * Magic-link token only in POST body (never query/path/storage).
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
  AdminLoginRequest,
  AdminLoginResult,
  AdminLogoutResult,
  BuyerMagicLinkConsumeRequest,
  BuyerMagicLinkConsumeResult,
  BuyerMagicLinkRequest,
  BuyerMagicLinkRequestResult,
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
  magicLinkRequestSuccessMessage,
  mapAdminLoginDataToResult,
  mapAdminLoginThrown,
  mapForgotThrown,
  mapLoginDataToResult,
  mapLoginThrown,
  mapMagicLinkConsumeData,
  mapMagicLinkConsumeThrown,
  mapMagicLinkRequestThrown,
  mapRegisterThrown,
  registerSuccessMessage,
  resolveAdminPostAuthPath,
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
