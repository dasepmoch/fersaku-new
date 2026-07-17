"use client";

/**
 * SEL-310 hooks. Query cache holds domain rows without verificationToken.
 * One-time token stays in component state via create mutation result.
 */

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  createStoreDomain,
  deleteStoreDomain,
  getStoreDomain,
  listStoreDomains,
  verifyStoreDomain,
} from "./api";
import type {
  CreateStoreDomainInput,
  DeleteStoreDomainInput,
  VerifyStoreDomainInput,
} from "./contracts";
import { demoStoreDomains } from "./mock";

function invalidateDomains(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.domains(storeId),
  });
}

export function useStoreDomains(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.domains(storeId),
    queryFn: (signal) => listStoreDomains(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoStoreDomains(storeId || "demo"),
    ),
  });
}

export function useStoreDomain(storeId: string, domainId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.domain(storeId, domainId),
    queryFn: (signal) => getStoreDomain(storeId, domainId, signal),
    enabled: Boolean(storeId) && Boolean(domainId),
  });
}

export function useCreateStoreDomain(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "domains", "create"],
    mutationFn: (input: CreateStoreDomainInput, signal) =>
      createStoreDomain(storeId, input, signal),
    onSuccess: () => {
      invalidateDomains(queryClient, storeId);
    },
  });
}

export function useVerifyStoreDomain(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "domains", "verify"],
    mutationFn: (input: VerifyStoreDomainInput, signal) =>
      verifyStoreDomain(storeId, input, signal),
    onSuccess: () => {
      invalidateDomains(queryClient, storeId);
    },
  });
}

export function useDeleteStoreDomain(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "domains", "delete"],
    mutationFn: (input: DeleteStoreDomainInput, signal) =>
      deleteStoreDomain(storeId, input, signal),
    onSuccess: () => {
      invalidateDomains(queryClient, storeId);
    },
  });
}
