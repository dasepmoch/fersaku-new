"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getSellerCustomer,
  listSellerCustomers,
  upsertSellerCustomerNote,
} from "./api";
import type { SellerCustomerListFilters } from "./contracts";
import { demoCustomers } from "./mock";

export function useSellerCustomers(
  storeId: string,
  filters: SellerCustomerListFilters = {},
) {
  const normalized: SellerCustomerListFilters = {
    q: filters.q?.trim() || undefined,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 5,
  };
  return useAppQuery({
    queryKey: queryKeys.seller.customers(
      storeId,
      normalized as Record<string, unknown>,
    ),
    queryFn: (signal) => listSellerCustomers(storeId, normalized, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerOperations", {
      items: demoCustomers(),
      page: 1,
      pageSize: normalized.pageSize ?? 5,
      totalCount: demoCustomers().length,
      pageCount: 1,
    }),
  });
}

export function useSellerCustomer(storeId: string, customerId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.customer(storeId, customerId),
    queryFn: (signal) => getSellerCustomer(storeId, customerId, signal),
    enabled: Boolean(storeId && customerId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoCustomers().find((c) => c.id === customerId) || null,
    ),
  });
}

/** Existing "Simpan catatan" control — no optimistic success. */
export function useUpsertSellerCustomerNote(
  storeId: string,
  customerId: string,
) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "customers", customerId, "notes"],
    mutationFn: async (
      variables: { body: string; expectedVersion?: number },
      signal,
    ) =>
      upsertSellerCustomerNote(storeId, customerId, variables.body, {
        expectedVersion: variables.expectedVersion,
        signal,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.seller.customer(storeId, customerId),
      });
      await queryClient.invalidateQueries({
        queryKey: ["seller", storeId, "customers"],
      });
    },
  });
}
