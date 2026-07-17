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
    placeholderData: mockPlaceholderData("sellerFinance", demoFinanceSummary(storeId)),
  });
}

export function useSellerRevenue(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.revenue(storeId),
    queryFn: (signal) => getSellerRevenue(storeId, signal),
    placeholderData: mockPlaceholderData("sellerFinance", demoSellerRevenue()),
  });
}

export function useSellerLedger(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.ledger(storeId),
    queryFn: (signal) => listSellerLedger(storeId, undefined, signal),
    placeholderData: mockPlaceholderData("sellerFinance", demoSellerLedger(storeId)),
  });
}

export function useSellerWithdrawals(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.withdrawals(storeId),
    queryFn: (signal) => listSellerWithdrawals(storeId, signal),
    placeholderData: mockPlaceholderData("sellerFinance", demoSellerWithdrawals(storeId)),
  });
}

export function useSellerWithdrawalLock(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.withdrawalLock(storeId),
    queryFn: (signal) => getSellerWithdrawalLock(storeId, signal),
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
    },
  });
}
