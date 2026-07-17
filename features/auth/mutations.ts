/**
 * AUT-100/AUT-110 — seller + buyer auth mutations.
 * mutationKey never includes email/password/token; gcTime 0 so secrets leave cache ASAP.
 */

"use client";

import { useAppMutation } from "@/shared/query/create-mutation";
import {
  consumeBuyerMagicLink,
  forgotSellerPassword,
  loginAdmin,
  loginSeller,
  logoutAdmin,
  logoutSeller,
  registerSeller,
  requestBuyerMagicLink,
} from "./api";
import type {
  AdminLoginRequest,
  BuyerMagicLinkConsumeRequest,
  BuyerMagicLinkRequest,
  SellerForgotPasswordRequest,
  SellerLoginRequest,
  SellerRegisterRequest,
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

assertAuthMutationKeySafe(REGISTER_KEY);
assertAuthMutationKeySafe(LOGIN_KEY);
assertAuthMutationKeySafe(FORGOT_KEY);
assertAuthMutationKeySafe(LOGOUT_KEY);
assertAuthMutationKeySafe(ADMIN_LOGIN_KEY);
assertAuthMutationKeySafe(ADMIN_LOGOUT_KEY);
assertAuthMutationKeySafe(MAGIC_REQUEST_KEY);
assertAuthMutationKeySafe(MAGIC_CONSUME_KEY);

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
