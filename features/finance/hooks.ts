"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  createSellerWithdrawal,
  getSellerFinanceSummary,
  getSellerRevenue,
  getSellerWithdrawalLock,
  listSellerLedger,
  listSellerWithdrawals,
  requestSellerWithdrawalQuote,
} from "./api";
import {
  demoFinanceSummary,
  demoSellerLedger,
  demoSellerWithdrawals,
  demoWithdrawalLock,
} from "./demo-data";
import { demoSellerRevenue } from "./mock";
import type {
  CreateSellerWithdrawalInput,
  RequestSellerWithdrawalQuoteInput,
} from "./contracts";

export function useSellerFinanceSummary(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.finance(storeId),
    queryFn: (signal) => getSellerFinanceSummary(storeId, signal),
    enabled: Boolean(storeId),
    surface: "finance",
    keepPrevious: true,
    placeholderData: mockPlaceholderData(
      "sellerFinance",
      demoFinanceSummary(storeId),
    ),
  });
}

export function useSellerRevenue(storeId: string, days = 7) {
  const safeDays = Math.min(90, Math.max(1, Math.trunc(days) || 7));
  return useAppQuery({
    queryKey: queryKeys.seller.revenue(storeId, { days: safeDays }),
    queryFn: (signal) => getSellerRevenue(storeId, signal, safeDays),
    enabled: Boolean(storeId),
    surface: "finance",
    keepPrevious: true,
    placeholderData: mockPlaceholderData("sellerFinance", demoSellerRevenue()),
  });
}

/** First-page ledger (CursorList profile; balance UI has no paging control). */
export function useSellerLedger(
  storeId: string,
  filters: { source?: string; cursor?: string } = {},
) {
  return useAppQuery({
    queryKey: queryKeys.seller.ledger(storeId, {
      source: filters.source ?? null,
      cursor: filters.cursor ?? null,
      profile: "cursor-first",
    }),
    queryFn: (signal) =>
      listSellerLedger(storeId, filters.cursor, signal, {
        source: filters.source as
          | "STOREFRONT"
          | "QRIS_API"
          | "MIXED"
          | "SYSTEM"
          | undefined,
      }),
    enabled: Boolean(storeId),
    surface: "finance",
    keepPrevious: true,
    placeholderData: mockPlaceholderData(
      "sellerFinance",
      demoSellerLedger(storeId),
    ),
  });
}

export function useSellerWithdrawals(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.withdrawals(storeId),
    queryFn: (signal) => listSellerWithdrawals(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerFinance", demoSellerWithdrawals(storeId)),
  });
}

export function useSellerWithdrawalLock(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.withdrawalLock(storeId),
    queryFn: (signal) => getSellerWithdrawalLock(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerFinance", demoWithdrawalLock),
  });
}

export function useSellerWithdrawalQuoteMutation() {
  return useAppMutation({
    mutationKey: ["seller", "withdrawal-quote"],
    mutationFn: (input: RequestSellerWithdrawalQuoteInput, signal) =>
      requestSellerWithdrawalQuote(input, signal),
  });
}

export function useCreateSellerWithdrawalMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "withdrawal-create"],
    mutationFn: (input: CreateSellerWithdrawalInput, signal) =>
      createSellerWithdrawal(input, signal),
    onSuccess: (withdrawal) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.withdrawals(withdrawal.storeId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.finance(withdrawal.storeId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["seller", withdrawal.storeId, "ledger"],
      });
    },
  });
}
