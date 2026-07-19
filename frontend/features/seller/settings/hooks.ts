"use client";

import {
  getDomainSource,
  mockPlaceholderData,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionClaims } from "@/shared/auth/session-provider";
import {
  archiveSellerBankAccount,
  createSellerBankAccount,
  getSellerProfile,
  listSellerBankAccounts,
  listSellerSessions,
  makePrimarySellerBankAccount,
  patchSellerNotificationPreferences,
  patchSellerProfile,
  revokeOtherSellerSessions,
  updateSellerBankAccount,
} from "./api";
import type {
  CreateSellerBankAccountInput,
  PatchSellerNotificationPreferencesInput,
  PatchSellerProfileInput,
  SellerProfile,
  UpdateSellerBankAccountInput,
} from "./contracts";
import {
  demoSellerBankAccounts,
  demoSellerProfile,
  demoSellerSessions,
} from "./mock";

function sellerSubjectKey(
  claims: { subjectId?: string; sessionId?: string } | null,
) {
  if (!claims?.subjectId) return "anon";
  return `${claims.subjectId}:${claims.sessionId ?? "session"}`;
}

function profileQueryEnabled(hasSubject: boolean): boolean {
  if (getDomainSource("auth") === "mock") return true;
  return hasSubject;
}

/** SEL-340: authoritative profile + prefs — no localStorage truth on API path. */
export function useSellerProfile() {
  const claims = useSessionClaims();
  const subject = sellerSubjectKey(claims);
  return useAppQuery({
    queryKey: queryKeys.seller.profile(subject),
    queryFn: (signal) => getSellerProfile(signal),
    surface: "private",
    placeholderData: mockPlaceholderData("auth", demoSellerProfile()),
    enabled: profileQueryEnabled(Boolean(claims?.subjectId)),
  });
}

/**
 * SEL-340: patch profile with expectedVersion.
 * 409 keeps user input (no optimistic overwrite); invalidate after success.
 */
export function usePatchSellerProfileMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = sellerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["seller", subject, "profile", "patch"],
    mutationFn: (input: PatchSellerProfileInput, signal) =>
      patchSellerProfile(input, signal),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.seller.profile(subject), profile);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.profile(subject),
      });
    },
  });
}

export function usePatchSellerNotificationPreferencesMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = sellerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["seller", subject, "notification-preferences", "patch"],
    mutationFn: (input: PatchSellerNotificationPreferencesInput, signal) =>
      patchSellerNotificationPreferences(input, signal),
    onSuccess: (toggles) => {
      const key = queryKeys.seller.profile(subject);
      const prev = queryClient.getQueryData<SellerProfile>(key);
      if (prev) {
        queryClient.setQueryData(key, { ...prev, ...toggles });
      }
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.notificationPreferences(subject),
      });
    },
  });
}

/** SEL-340: store-scoped bank list — masked only. */
export function useSellerBankAccounts(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.bankAccounts(storeId),
    queryFn: (signal) => listSellerBankAccounts(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData(
      "sellerFinance",
      demoSellerBankAccounts(storeId || "demo"),
    ),
  });
}

function invalidateBanks(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.bankAccounts(storeId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.withdrawalLock(storeId),
  });
}

export function useCreateSellerBankAccount(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "bank-accounts", "create"],
    mutationFn: (input: CreateSellerBankAccountInput, signal) =>
      createSellerBankAccount(storeId, input, signal),
    onSuccess: () => {
      invalidateBanks(queryClient, storeId);
    },
  });
}

export function useUpdateSellerBankAccount(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "bank-accounts", "update"],
    mutationFn: (input: UpdateSellerBankAccountInput, signal) =>
      updateSellerBankAccount(storeId, input, signal),
    onSuccess: () => {
      invalidateBanks(queryClient, storeId);
    },
  });
}

export function useArchiveSellerBankAccount(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "bank-accounts", "archive"],
    mutationFn: (bankId: string, signal) =>
      archiveSellerBankAccount(storeId, bankId, signal),
    onSuccess: () => {
      invalidateBanks(queryClient, storeId);
    },
  });
}

export function useMakePrimarySellerBankAccount(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "bank-accounts", "make-primary"],
    mutationFn: (bankId: string, signal) =>
      makePrimarySellerBankAccount(storeId, bankId, signal),
    onSuccess: () => {
      invalidateBanks(queryClient, storeId);
    },
  });
}

/** SEL-340: session list (auth) — for security tab when chrome exists. */
export function useSellerSessions() {
  const claims = useSessionClaims();
  const subject = sellerSubjectKey(claims);
  return useAppQuery({
    queryKey: queryKeys.seller.sessions(subject),
    queryFn: (signal) => listSellerSessions(signal),
    surface: "private",
    placeholderData: mockPlaceholderData("auth", demoSellerSessions()),
    enabled: profileQueryEnabled(Boolean(claims?.subjectId)),
  });
}

export function useRevokeOtherSellerSessionsMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = sellerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["seller", subject, "sessions", "revoke-others"],
    mutationFn: (_: void, signal) => revokeOtherSellerSessions(signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.sessions(subject),
      });
    },
  });
}
