"use client";

import { isLiveApi } from "@/shared/data/mode";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import {
  demoBuyerPurchases,
  demoBuyerSessions,
  demoBuyers,
  getBuyer,
  listBuyerPurchases,
  listBuyerSessions,
  listBuyers,
} from "./buyers";
import {
  demoAdminRoles,
  demoPermissionGroups,
  listAdminRoles,
  listPermissionGroups,
} from "./access";
import {
  demoAuditEvents,
  demoPlatformVolume,
  getPlatformVolume,
  listAuditEvents,
} from "./overview";
import { demoInventory, getInventory } from "./inventory";
import { demoAdminReviews, listAdminReviews } from "./reviews";
import { demoMerchants, getMerchant, listMerchants } from "./merchants";
import { demoAdminOrders, getAdminOrder, listAdminOrders } from "./orders";
import { demoPayments, listPayments } from "./payments";
import { demoWithdrawals, getWithdrawal, listWithdrawals } from "./withdrawals";

export function useAdminMerchants() {
  return useAppQuery({
    queryKey: queryKeys.admin.merchants(),
    queryFn: (signal) => listMerchants(signal),
    placeholderData: isLiveApi() ? undefined : demoMerchants(),
  });
}

export function useAdminMerchant(merchantId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.merchant(merchantId),
    queryFn: (signal) => getMerchant(merchantId, signal),
    enabled: Boolean(merchantId),
    placeholderData: isLiveApi()
      ? undefined
      : demoMerchants().find((m) => m.id === merchantId) || null,
  });
}

export function useAdminBuyers() {
  return useAppQuery({
    queryKey: queryKeys.admin.buyers(),
    queryFn: (signal) => listBuyers(signal),
    placeholderData: isLiveApi() ? undefined : demoBuyers(),
  });
}

export function useAdminBuyer(buyerId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.buyer(buyerId),
    queryFn: (signal) => getBuyer(buyerId, signal),
    enabled: Boolean(buyerId),
    placeholderData: isLiveApi()
      ? undefined
      : demoBuyers().find((b) => b.id === buyerId) || null,
  });
}

export function useAdminOrders() {
  return useAppQuery({
    queryKey: queryKeys.admin.orders(),
    queryFn: (signal) => listAdminOrders(signal),
    placeholderData: isLiveApi() ? undefined : demoAdminOrders(),
  });
}

export function useAdminOrder(orderId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.order(orderId),
    queryFn: (signal) => getAdminOrder(orderId, signal),
    enabled: Boolean(orderId),
    placeholderData: isLiveApi()
      ? undefined
      : demoAdminOrders().find((o) => o.id === orderId) || null,
  });
}

export function useAdminWithdrawals() {
  return useAppQuery({
    queryKey: queryKeys.admin.withdrawals(),
    queryFn: (signal) => listWithdrawals(signal),
    placeholderData: isLiveApi() ? undefined : demoWithdrawals(),
  });
}

export function useAdminWithdrawal(withdrawalId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.withdrawal(withdrawalId),
    queryFn: (signal) => getWithdrawal(withdrawalId, signal),
    enabled: Boolean(withdrawalId),
    placeholderData: isLiveApi()
      ? undefined
      : demoWithdrawals().find((w) => w.id === withdrawalId) || null,
  });
}

export function useAdminPayments() {
  return useAppQuery({
    queryKey: queryKeys.admin.payments(),
    queryFn: (signal) => listPayments(signal),
    placeholderData: isLiveApi() ? undefined : demoPayments(),
  });
}

export function useAdminBuyerPurchases(buyerId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.buyerPurchases(buyerId),
    queryFn: (signal) => listBuyerPurchases(buyerId, signal),
    enabled: Boolean(buyerId),
    placeholderData: isLiveApi() ? undefined : demoBuyerPurchases(),
  });
}

export function useAdminBuyerSessions(buyerId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.buyerSessions(buyerId),
    queryFn: (signal) => listBuyerSessions(buyerId, signal),
    enabled: Boolean(buyerId),
    placeholderData: isLiveApi() ? undefined : demoBuyerSessions(),
  });
}

export function useAdminAuditEvents() {
  return useAppQuery({
    queryKey: queryKeys.admin.auditLogs(),
    queryFn: (signal) => listAuditEvents(signal),
    placeholderData: isLiveApi() ? undefined : demoAuditEvents(),
  });
}

export function useAdminPlatformVolume() {
  return useAppQuery({
    queryKey: queryKeys.admin.platformVolume(),
    queryFn: (signal) => getPlatformVolume(signal),
    placeholderData: isLiveApi() ? undefined : demoPlatformVolume(),
  });
}

export function useAdminRoles() {
  return useAppQuery({
    queryKey: queryKeys.admin.roles(),
    queryFn: (signal) => listAdminRoles(signal),
    placeholderData: isLiveApi() ? undefined : demoAdminRoles(),
  });
}

export function useAdminPermissionGroups() {
  return useAppQuery({
    queryKey: queryKeys.admin.permissionGroups(),
    queryFn: (signal) => listPermissionGroups(signal),
    placeholderData: isLiveApi() ? undefined : demoPermissionGroups(),
  });
}

export function useAdminInventory() {
  return useAppQuery({
    queryKey: queryKeys.admin.inventory(),
    queryFn: (signal) => getInventory(signal),
    placeholderData: isLiveApi() ? undefined : demoInventory(),
  });
}

export function useAdminReviews() {
  return useAppQuery({
    queryKey: queryKeys.admin.reviews(),
    queryFn: (signal) => listAdminReviews(signal),
    placeholderData: isLiveApi() ? undefined : demoAdminReviews(),
  });
}
