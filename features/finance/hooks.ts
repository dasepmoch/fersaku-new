"use client";

import { isLiveApi } from "@/shared/data/mode";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import {
  getSellerFinanceSummary,
  getSellerRevenue,
  getSellerWithdrawalLock,
  listSellerLedger,
  listSellerWithdrawals,
} from "./api";
import {
  demoFinanceSummary,
  demoSellerLedger,
  demoSellerWithdrawals,
  demoWithdrawalLock,
} from "./demo-data";
import { demoSellerRevenue } from "./mock";

export function useSellerFinanceSummary(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.finance(storeId),
    queryFn: (signal) => getSellerFinanceSummary(storeId, signal),
    placeholderData: isLiveApi() ? undefined : demoFinanceSummary(storeId),
  });
}

export function useSellerRevenue(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.revenue(storeId),
    queryFn: (signal) => getSellerRevenue(storeId, signal),
    placeholderData: isLiveApi() ? undefined : demoSellerRevenue(),
  });
}

export function useSellerLedger(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.ledger(storeId),
    queryFn: (signal) => listSellerLedger(storeId, undefined, signal),
    placeholderData: isLiveApi() ? undefined : demoSellerLedger(storeId),
  });
}

export function useSellerWithdrawals(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.withdrawals(storeId),
    queryFn: (signal) => listSellerWithdrawals(storeId, signal),
    placeholderData: isLiveApi() ? undefined : demoSellerWithdrawals(storeId),
  });
}

export function useSellerWithdrawalLock(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.withdrawalLock(storeId),
    queryFn: (signal) => getSellerWithdrawalLock(storeId, signal),
    placeholderData: isLiveApi() ? undefined : demoWithdrawalLock,
  });
}
