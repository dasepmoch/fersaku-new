"use client";

/**
 * SEL-330 hooks. Query cache holds masked credentials + KYC status only.
 * claimToken / apiKey stay in component state via mutation result.
 */

import { useEffect, useRef, useState } from "react";
import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  claimSellerApiCredential,
  createSellerKycCase,
  getSellerKycStatus,
  listSellerApiCredentials,
  requestSellerApiCredential,
  revokeSellerApiCredential,
  submitSellerKycCase,
} from "./api";
import type {
  ApiKeyReveal,
  CreateKycCaseInput,
  RequestApiCredentialInput,
} from "./contracts";
import { demoApiCredentials, demoKycStatus } from "./mock";

const API_KEY_REVEAL_TTL_MS = 5 * 60_000;

function invalidateCredentials(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.apiKeys(storeId),
  });
}

export function useSellerApiCredentials(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.apiKeys(storeId),
    queryFn: (signal) => listSellerApiCredentials(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoApiCredentials(storeId || "demo"),
    ),
  });
}

export function useSellerKycStatus(subjectKey = "anon") {
  return useAppQuery({
    queryKey: queryKeys.seller.kyc(subjectKey),
    queryFn: (signal) => getSellerKycStatus(signal),
    placeholderData: mockPlaceholderData("sellerOperations", demoKycStatus()),
  });
}

export function useRequestSellerApiCredential(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "api-credentials", "request"],
    mutationFn: async (input: RequestApiCredentialInput = {}, signal) =>
      requestSellerApiCredential(storeId, input, signal),
    onSuccess: async () => {
      invalidateCredentials(queryClient, storeId);
    },
  });
}

export function useClaimSellerApiCredential(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "api-credentials", "claim"],
    mutationFn: async (
      variables: { claimToken: string; claimId?: string; mfaCode?: string },
      signal,
    ) =>
      claimSellerApiCredential(
        storeId,
        variables.claimToken,
        {
          claimId: variables.claimId,
          mfaCode: variables.mfaCode,
        },
        signal,
      ),
    onSuccess: async () => {
      invalidateCredentials(queryClient, storeId);
    },
  });
}

export function useRevokeSellerApiCredential(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "api-credentials", "revoke"],
    mutationFn: async (
      variables: { keyId: string; reason?: string; mfaCode?: string },
      signal,
    ) =>
      revokeSellerApiCredential(
        storeId,
        variables.keyId,
        { reason: variables.reason, mfaCode: variables.mfaCode },
        signal,
      ),
    onSuccess: async () => {
      invalidateCredentials(queryClient, storeId);
    },
  });
}

export function useCreateSellerKycCase(subjectKey = "anon") {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", subjectKey, "kyc", "create"],
    mutationFn: async (input: CreateKycCaseInput, signal) =>
      createSellerKycCase(input, signal),
    onSuccess: async () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.kyc(subjectKey),
      });
    },
  });
}

export function useSubmitSellerKycCase(subjectKey = "anon") {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", subjectKey, "kyc", "submit"],
    mutationFn: async (caseId: string, signal) =>
      submitSellerKycCase(caseId, signal),
    onSuccess: async () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.kyc(subjectKey),
      });
    },
  });
}

/**
 * Component-local one-time API key reveal with TTL + visibility/unmount clear.
 * Never put reveal into React Query or storage.
 */
export function useApiKeyRevealMemory() {
  const [reveal, setReveal] = useState<ApiKeyReveal | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setReveal(null);
  };

  const hold = (next: ApiKeyReveal) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setReveal(next);
    timerRef.current = setTimeout(clear, API_KEY_REVEAL_TTL_MS);
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") clear();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  return { reveal, hold, clear };
}
