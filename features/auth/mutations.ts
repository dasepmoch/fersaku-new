/**
 * AUT-100 — seller auth mutations.
 * mutationKey never includes email/password; gcTime 0 so secrets leave cache ASAP.
 */

"use client";

import { useAppMutation } from "@/shared/query/create-mutation";
import {
  forgotSellerPassword,
  loginSeller,
  logoutSeller,
  registerSeller,
} from "./api";
import type {
  SellerForgotPasswordRequest,
  SellerLoginRequest,
  SellerRegisterRequest,
} from "./contracts";
import { assertAuthMutationKeySafe } from "./mappers";

const REGISTER_KEY = ["auth", "seller", "register"] as const;
const LOGIN_KEY = ["auth", "seller", "login"] as const;
const FORGOT_KEY = ["auth", "seller", "forgot"] as const;
const LOGOUT_KEY = ["auth", "seller", "logout"] as const;

assertAuthMutationKeySafe(REGISTER_KEY);
assertAuthMutationKeySafe(LOGIN_KEY);
assertAuthMutationKeySafe(FORGOT_KEY);
assertAuthMutationKeySafe(LOGOUT_KEY);

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

export const SELLER_AUTH_MUTATION_KEYS = {
  register: REGISTER_KEY,
  login: LOGIN_KEY,
  forgot: FORGOT_KEY,
  logout: LOGOUT_KEY,
} as const;
