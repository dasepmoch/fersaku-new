/**
 * AUT-100/AUT-110/AUT-120 — auth mutations.
 * mutationKey never includes email/password/token/code/secret; gcTime 0.
 */

"use client";

import { useAppMutation } from "@/shared/query/create-mutation";
import {
  changePassword,
  confirmEmailChangeCurrent,
  confirmEmailChangeNew,
  confirmMfa,
  consumeBuyerMagicLink,
  disableMfa,
  enrollMfa,
  forgotSellerPassword,
  loginAdmin,
  loginSeller,
  logoutAdmin,
  logoutSeller,
  regenerateMfaRecoveryCodes,
  registerSeller,
  requestBuyerMagicLink,
  requestEmailChange,
  resetPassword,
  stepUpMfa,
  verifyEmail,
  verifyMfa,
} from "./api";
import type {
  AdminLoginRequest,
  BuyerMagicLinkConsumeRequest,
  BuyerMagicLinkRequest,
  EmailChangeConfirmRequest,
  EmailChangeRequest,
  MfaConfirmRequest,
  MfaDisableRequest,
  MfaRegenerateRecoveryRequest,
  MfaStepUpRequest,
  MfaVerifyRequest,
  PasswordChangeRequest,
  PasswordResetRequest,
  SellerForgotPasswordRequest,
  SellerLoginRequest,
  SellerRegisterRequest,
  VerifyEmailRequest,
} from "./contracts";
import { assertAuthMutationKeySafe } from "./mappers";

const REGISTER_KEY = ["auth", "seller", "register"] as const;
const LOGIN_KEY = ["auth", "seller", "login"] as const;
const FORGOT_KEY = ["auth", "seller", "forgot"] as const;
const LOGOUT_KEY = ["auth", "seller", "logout"] as const;
const ADMIN_LOGIN_KEY = ["auth", "admin", "login"] as const;
const ADMIN_LOGOUT_KEY = ["auth", "admin", "logout"] as const;
const MAGIC_REQUEST_KEY = ["auth", "buyer", "magic-link", "request"] as const;
const MAGIC_CONSUME_KEY = ["auth", "buyer", "magic-link", "consume"] as const;
const RESET_KEY = ["auth", "ceremony", "reset"] as const;
const CHANGE_PASSWORD_KEY = ["auth", "ceremony", "change-password"] as const;
const EMAIL_CHANGE_REQUEST_KEY = ["auth", "email-change", "request"] as const;
const EMAIL_CHANGE_CONFIRM_CURRENT_KEY = [
  "auth",
  "email-change",
  "confirm-current",
] as const;
const EMAIL_CHANGE_CONFIRM_NEW_KEY = [
  "auth",
  "email-change",
  "confirm-new",
] as const;
const MFA_VERIFY_KEY = ["auth", "mfa", "verify"] as const;
const MFA_STEP_UP_KEY = ["auth", "mfa", "step-up"] as const;
const MFA_ENROLL_KEY = ["auth", "mfa", "enroll"] as const;
const MFA_CONFIRM_KEY = ["auth", "mfa", "confirm"] as const;
const MFA_DISABLE_KEY = ["auth", "mfa", "disable"] as const;
const MFA_REGEN_KEY = ["auth", "mfa", "recovery-regenerate"] as const;
const VERIFY_EMAIL_KEY = ["auth", "verify-email"] as const;

assertAuthMutationKeySafe(REGISTER_KEY);
assertAuthMutationKeySafe(LOGIN_KEY);
assertAuthMutationKeySafe(FORGOT_KEY);
assertAuthMutationKeySafe(LOGOUT_KEY);
assertAuthMutationKeySafe(ADMIN_LOGIN_KEY);
assertAuthMutationKeySafe(ADMIN_LOGOUT_KEY);
assertAuthMutationKeySafe(MAGIC_REQUEST_KEY);
assertAuthMutationKeySafe(MAGIC_CONSUME_KEY);
assertAuthMutationKeySafe(RESET_KEY);
assertAuthMutationKeySafe(CHANGE_PASSWORD_KEY);
assertAuthMutationKeySafe(EMAIL_CHANGE_REQUEST_KEY);
assertAuthMutationKeySafe(EMAIL_CHANGE_CONFIRM_CURRENT_KEY);
assertAuthMutationKeySafe(EMAIL_CHANGE_CONFIRM_NEW_KEY);
assertAuthMutationKeySafe(MFA_VERIFY_KEY);
assertAuthMutationKeySafe(MFA_STEP_UP_KEY);
assertAuthMutationKeySafe(MFA_ENROLL_KEY);
assertAuthMutationKeySafe(MFA_CONFIRM_KEY);
assertAuthMutationKeySafe(MFA_DISABLE_KEY);
assertAuthMutationKeySafe(MFA_REGEN_KEY);
assertAuthMutationKeySafe(VERIFY_EMAIL_KEY);

export function useSellerRegisterMutation() {
  return useAppMutation({
    mutationKey: [...REGISTER_KEY],
    gcTime: 0,
    mutationFn: (input: SellerRegisterRequest, signal) =>
      registerSeller(input, signal),
  });
}

export function useSellerLoginMutation() {
  return useAppMutation({
    mutationKey: [...LOGIN_KEY],
    gcTime: 0,
    mutationFn: (
      input: SellerLoginRequest & { returnTo?: string | null },
      signal,
    ) => {
      const { returnTo, ...body } = input;
      return loginSeller(body, { returnTo, signal });
    },
  });
}

export function useSellerForgotPasswordMutation() {
  return useAppMutation({
    mutationKey: [...FORGOT_KEY],
    gcTime: 0,
    mutationFn: (input: SellerForgotPasswordRequest, signal) =>
      forgotSellerPassword(input, signal),
  });
}

export function useSellerLogoutMutation() {
  return useAppMutation({
    mutationKey: [...LOGOUT_KEY],
    gcTime: 0,
    mutationFn: async () => logoutSeller(),
  });
}

export function useAdminLoginMutation() {
  return useAppMutation({
    mutationKey: [...ADMIN_LOGIN_KEY],
    gcTime: 0,
    mutationFn: (
      input: AdminLoginRequest & { returnTo?: string | null },
      signal,
    ) => {
      const { returnTo, ...body } = input;
      return loginAdmin(body, { returnTo, signal });
    },
  });
}

export function useAdminLogoutMutation() {
  return useAppMutation({
    mutationKey: [...ADMIN_LOGOUT_KEY],
    gcTime: 0,
    mutationFn: async () => logoutAdmin(),
  });
}

export function useBuyerMagicLinkRequestMutation() {
  return useAppMutation({
    mutationKey: [...MAGIC_REQUEST_KEY],
    gcTime: 0,
    mutationFn: (input: BuyerMagicLinkRequest, signal) =>
      requestBuyerMagicLink(input, signal),
  });
}

export function useBuyerMagicLinkConsumeMutation() {
  return useAppMutation({
    mutationKey: [...MAGIC_CONSUME_KEY],
    gcTime: 0,
    mutationFn: (
      input: BuyerMagicLinkConsumeRequest & { returnTo?: string | null },
      signal,
    ) => {
      const { returnTo, ...body } = input;
      return consumeBuyerMagicLink(body, { returnTo, signal });
    },
  });
}

export function usePasswordResetMutation() {
  return useAppMutation({
    mutationKey: [...RESET_KEY],
    gcTime: 0,
    mutationFn: (input: PasswordResetRequest, signal) =>
      resetPassword(input, signal),
  });
}

export function usePasswordChangeMutation() {
  return useAppMutation({
    mutationKey: [...CHANGE_PASSWORD_KEY],
    gcTime: 0,
    mutationFn: (input: PasswordChangeRequest, signal) =>
      changePassword(input, signal),
  });
}

export function useEmailChangeRequestMutation() {
  return useAppMutation({
    mutationKey: [...EMAIL_CHANGE_REQUEST_KEY],
    gcTime: 0,
    mutationFn: (input: EmailChangeRequest, signal) =>
      requestEmailChange(input, signal),
  });
}

export function useEmailChangeConfirmCurrentMutation() {
  return useAppMutation({
    mutationKey: [...EMAIL_CHANGE_CONFIRM_CURRENT_KEY],
    gcTime: 0,
    mutationFn: (input: EmailChangeConfirmRequest, signal) =>
      confirmEmailChangeCurrent(input, signal),
  });
}

export function useEmailChangeConfirmNewMutation() {
  return useAppMutation({
    mutationKey: [...EMAIL_CHANGE_CONFIRM_NEW_KEY],
    gcTime: 0,
    mutationFn: (input: EmailChangeConfirmRequest, signal) =>
      confirmEmailChangeNew(input, signal),
  });
}

export function useMfaVerifyMutation() {
  return useAppMutation({
    mutationKey: [...MFA_VERIFY_KEY],
    gcTime: 0,
    mutationFn: (
      input: MfaVerifyRequest & {
        returnTo?: string | null;
        surface?: "seller" | "admin";
      },
      signal,
    ) => {
      const { returnTo, surface, ...body } = input;
      return verifyMfa(body, { returnTo, surface, signal });
    },
  });
}

export function useMfaStepUpMutation() {
  return useAppMutation({
    mutationKey: [...MFA_STEP_UP_KEY],
    gcTime: 0,
    mutationFn: (input: MfaStepUpRequest, signal) => stepUpMfa(input, signal),
  });
}

export function useMfaEnrollMutation() {
  return useAppMutation({
    mutationKey: [...MFA_ENROLL_KEY],
    gcTime: 0,
    mutationFn: async (_input: void, signal) => enrollMfa(signal),
  });
}

export function useMfaConfirmMutation() {
  return useAppMutation({
    mutationKey: [...MFA_CONFIRM_KEY],
    gcTime: 0,
    mutationFn: (input: MfaConfirmRequest, signal) => confirmMfa(input, signal),
  });
}

export function useMfaDisableMutation() {
  return useAppMutation({
    mutationKey: [...MFA_DISABLE_KEY],
    gcTime: 0,
    mutationFn: (input: MfaDisableRequest, signal) => disableMfa(input, signal),
  });
}

export function useMfaRegenerateRecoveryMutation() {
  return useAppMutation({
    mutationKey: [...MFA_REGEN_KEY],
    gcTime: 0,
    mutationFn: (input: MfaRegenerateRecoveryRequest, signal) =>
      regenerateMfaRecoveryCodes(input, signal),
  });
}

export function useVerifyEmailMutation() {
  return useAppMutation({
    mutationKey: [...VERIFY_EMAIL_KEY],
    gcTime: 0,
    mutationFn: (input: VerifyEmailRequest, signal) =>
      verifyEmail(input, signal),
  });
}

export const SELLER_AUTH_MUTATION_KEYS = {
  register: REGISTER_KEY,
  login: LOGIN_KEY,
  forgot: FORGOT_KEY,
  logout: LOGOUT_KEY,
} as const;

export const ADMIN_AUTH_MUTATION_KEYS = {
  login: ADMIN_LOGIN_KEY,
  logout: ADMIN_LOGOUT_KEY,
} as const;

export const BUYER_AUTH_MUTATION_KEYS = {
  magicLinkRequest: MAGIC_REQUEST_KEY,
  magicLinkConsume: MAGIC_CONSUME_KEY,
} as const;

export const AUTH_CEREMONY_MUTATION_KEYS = {
  passwordReset: RESET_KEY,
  passwordChange: CHANGE_PASSWORD_KEY,
  emailChangeRequest: EMAIL_CHANGE_REQUEST_KEY,
  emailChangeConfirmCurrent: EMAIL_CHANGE_CONFIRM_CURRENT_KEY,
  emailChangeConfirmNew: EMAIL_CHANGE_CONFIRM_NEW_KEY,
  mfaVerify: MFA_VERIFY_KEY,
  mfaStepUp: MFA_STEP_UP_KEY,
  mfaEnroll: MFA_ENROLL_KEY,
  mfaConfirm: MFA_CONFIRM_KEY,
  mfaDisable: MFA_DISABLE_KEY,
  mfaRegenerateRecovery: MFA_REGEN_KEY,
  verifyEmail: VERIFY_EMAIL_KEY,
} as const;
