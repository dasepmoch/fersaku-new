"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
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
    placeholderData: mockPlaceholderData("adminRead", demoMerchants()),
  });
}

export function useAdminMerchant(merchantId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.merchant(merchantId),
    queryFn: (signal) => getMerchant(merchantId, signal),
    enabled: Boolean(merchantId),
    placeholderData: mockPlaceholderData("adminRead", demoMerchants().find((m) => m.id === merchantId) || null),
  });
}

export function useAdminBuyers() {
  return useAppQuery({
    queryKey: queryKeys.admin.buyers(),
    queryFn: (signal) => listBuyers(signal),
    placeholderData: mockPlaceholderData("adminRead", demoBuyers()),
  });
}

export function useAdminBuyer(buyerId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.buyer(buyerId),
    queryFn: (signal) => getBuyer(buyerId, signal),
    enabled: Boolean(buyerId),
    placeholderData: mockPlaceholderData("adminRead", demoBuyers().find((b) => b.id === buyerId) || null),
  });
}

export function useAdminOrders() {
  return useAppQuery({
    queryKey: queryKeys.admin.orders(),
    queryFn: (signal) => listAdminOrders(signal),
    placeholderData: mockPlaceholderData("adminRead", demoAdminOrders()),
  });
}

export function useAdminOrder(orderId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.order(orderId),
    queryFn: (signal) => getAdminOrder(orderId, signal),
    enabled: Boolean(orderId),
    placeholderData: mockPlaceholderData("adminRead", demoAdminOrders().find((o) => o.id === orderId) || null),
  });
}

export function useAdminWithdrawals() {
  return useAppQuery({
    queryKey: queryKeys.admin.withdrawals(),
    queryFn: (signal) => listWithdrawals(signal),
    placeholderData: mockPlaceholderData("adminRead", demoWithdrawals()),
  });
}

export function useAdminWithdrawal(withdrawalId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.withdrawal(withdrawalId),
    queryFn: (signal) => getWithdrawal(withdrawalId, signal),
    enabled: Boolean(withdrawalId),
    placeholderData: mockPlaceholderData("adminRead", demoWithdrawals().find((w) => w.id === withdrawalId) || null),
  });
}

export function useAdminPayments() {
  return useAppQuery({
    queryKey: queryKeys.admin.payments(),
    queryFn: (signal) => listPayments(signal),
    placeholderData: mockPlaceholderData("adminRead", demoPayments()),
  });
}

export function useAdminBuyerPurchases(buyerId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.buyerPurchases(buyerId),
    queryFn: (signal) => listBuyerPurchases(buyerId, signal),
    enabled: Boolean(buyerId),
    placeholderData: mockPlaceholderData("adminRead", demoBuyerPurchases()),
  });
}

export function useAdminBuyerSessions(buyerId: string) {
  return useAppQuery({
    queryKey: queryKeys.admin.buyerSessions(buyerId),
    queryFn: (signal) => listBuyerSessions(buyerId, signal),
    enabled: Boolean(buyerId),
    placeholderData: mockPlaceholderData("adminRead", demoBuyerSessions()),
  });
}

export function useAdminAuditEvents() {
  return useAppQuery({
    queryKey: queryKeys.admin.auditLogs(),
    queryFn: (signal) => listAuditEvents(signal),
    placeholderData: mockPlaceholderData("adminRead", demoAuditEvents()),
  });
}

export function useAdminPlatformVolume() {
  return useAppQuery({
    queryKey: queryKeys.admin.platformVolume(),
    queryFn: (signal) => getPlatformVolume(signal),
    placeholderData: mockPlaceholderData("adminRead", demoPlatformVolume()),
  });
}

export function useAdminRoles() {
  return useAppQuery({
    queryKey: queryKeys.admin.roles(),
    queryFn: (signal) => listAdminRoles(signal),
    placeholderData: mockPlaceholderData("adminRead", demoAdminRoles()),
  });
}

export function useAdminPermissionGroups() {
  return useAppQuery({
    queryKey: queryKeys.admin.permissionGroups(),
    queryFn: (signal) => listPermissionGroups(signal),
    placeholderData: mockPlaceholderData("adminRead", demoPermissionGroups()),
  });
}

export function useAdminInventory() {
  return useAppQuery({
    queryKey: queryKeys.admin.inventory(),
    queryFn: (signal) => getInventory(signal),
    placeholderData: mockPlaceholderData("adminRead", demoInventory()),
  });
}

export function useAdminReviews() {
  return useAppQuery({
    queryKey: queryKeys.admin.reviews(),
    queryFn: (signal) => listAdminReviews(signal),
    placeholderData: mockPlaceholderData("adminRead", demoAdminReviews()),
  });
}
