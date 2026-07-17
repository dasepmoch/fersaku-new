"use client";

/**
 * ADM-120 — admin read hooks: permission-gated when adminRead is api.
 * Mock path keeps prototype fixtures; API path requires matching claim.
 */

import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  getDomainSource,
  mockPlaceholderData,
} from "@/shared/data/domain-source";
import { useSessionClaims } from "@/shared/auth/session-provider";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import type { AdminListFilters } from "./contracts";
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
  demoAdminOverview,
  demoAuditEvents,
  demoPlatformVolume,
  getAdminOverview,
  getPlatformVolume,
  listAuditEvents,
} from "./overview";
import { demoInventory, getInventory } from "./inventory";
import { demoAdminReviews, listAdminReviews } from "./reviews";
import { demoMerchants, getMerchant, listMerchants } from "./merchants";
import { demoAdminOrders, getAdminOrder, listAdminOrders } from "./orders";
import { demoPayments, listPayments } from "./payments";
import { demoWithdrawals, getWithdrawal, listWithdrawals } from "./withdrawals";
import { normalizeAdminListFilters } from "./mappers";

function useAdminReadEnabled(permission: string): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminRead") === "mock") return true;
  return claimsHavePermission(claims?.permissions, permission);
}

export function useAdminOverview() {
  const enabled = useAdminReadEnabled("admin.dashboard.read");
  return useAppQuery({
    queryKey: queryKeys.admin.overview(),
    queryFn: (signal) => getAdminOverview(signal),
    surface: "private",
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoAdminOverview()),
  });
}

export function useAdminPlatformVolume() {
  const enabled = useAdminReadEnabled("admin.dashboard.read");
  return useAppQuery({
    queryKey: queryKeys.admin.platformVolume(),
    queryFn: (signal) => getPlatformVolume(signal),
    surface: "private",
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoPlatformVolume()),
  });
}

export function useAdminMerchants(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("merchants.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.merchants(normalized),
    queryFn: (signal) => listMerchants(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoMerchants()),
  });
}

export function useAdminMerchant(merchantId: string) {
  const enabled = useAdminReadEnabled("merchants.read");
  return useAppQuery({
    queryKey: queryKeys.admin.merchant(merchantId),
    queryFn: (signal) => getMerchant(merchantId, signal),
    enabled: Boolean(merchantId) && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoMerchants().find((m) => m.id === merchantId) || null,
    ),
  });
}

export function useAdminBuyers(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("buyers.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.buyers(normalized),
    queryFn: (signal) => listBuyers(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoBuyers()),
  });
}

export function useAdminBuyer(buyerId: string) {
  const enabled = useAdminReadEnabled("buyers.read");
  return useAppQuery({
    queryKey: queryKeys.admin.buyer(buyerId),
    queryFn: (signal) => getBuyer(buyerId, signal),
    enabled: Boolean(buyerId) && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoBuyers().find((b) => b.id === buyerId) || null,
    ),
  });
}

export function useAdminOrders(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("orders.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.orders(normalized),
    queryFn: (signal) => listAdminOrders(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoAdminOrders()),
  });
}

export function useAdminOrder(orderId: string) {
  const enabled = useAdminReadEnabled("orders.read");
  return useAppQuery({
    queryKey: queryKeys.admin.order(orderId),
    queryFn: (signal) => getAdminOrder(orderId, signal),
    enabled: Boolean(orderId) && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoAdminOrders().find((o) => o.id === orderId) || null,
    ),
  });
}

export function useAdminWithdrawals(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("withdrawals.review");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.withdrawals(normalized),
    queryFn: (signal) => listWithdrawals(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoWithdrawals()),
  });
}

export function useAdminWithdrawal(withdrawalId: string) {
  const enabled = useAdminReadEnabled("withdrawals.review");
  return useAppQuery({
    queryKey: queryKeys.admin.withdrawal(withdrawalId),
    queryFn: (signal) => getWithdrawal(withdrawalId, signal),
    enabled: Boolean(withdrawalId) && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoWithdrawals().find((w) => w.id === withdrawalId) || null,
    ),
  });
}

export function useAdminPayments(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("payments.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.payments(normalized),
    queryFn: (signal) => listPayments(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoPayments()),
  });
}

export function useAdminBuyerPurchases(buyerId: string) {
  const enabled = useAdminReadEnabled("buyers.read");
  return useAppQuery({
    queryKey: queryKeys.admin.buyerPurchases(buyerId),
    queryFn: (signal) => listBuyerPurchases(buyerId, signal),
    enabled: Boolean(buyerId) && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData("adminRead", demoBuyerPurchases()),
  });
}

export function useAdminBuyerSessions(buyerId: string) {
  const enabled = useAdminReadEnabled("buyers.read");
  return useAppQuery({
    queryKey: queryKeys.admin.buyerSessions(buyerId),
    queryFn: (signal) => listBuyerSessions(buyerId, signal),
    enabled: Boolean(buyerId) && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData("adminRead", demoBuyerSessions()),
  });
}

export function useAdminAuditEvents(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("audit.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.auditLogs(normalized),
    queryFn: (signal) => listAuditEvents(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoAuditEvents()),
  });
}

export function useAdminRoles() {
  const enabled = useAdminReadEnabled("roles.read");
  return useAppQuery({
    queryKey: queryKeys.admin.roles(),
    queryFn: (signal) => listAdminRoles(signal),
    surface: "private",
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoAdminRoles()),
  });
}

export function useAdminPermissionGroups() {
  const enabled = useAdminReadEnabled("roles.read");
  return useAppQuery({
    queryKey: queryKeys.admin.permissionGroups(),
    queryFn: (signal) => listPermissionGroups(signal),
    surface: "private",
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoPermissionGroups()),
  });
}

export function useAdminInventory(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("inventory.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.inventory(normalized),
    queryFn: (signal) => getInventory(signal),
    surface: "private",
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoInventory()),
  });
}

export function useAdminReviews(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("reviews.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.reviews(normalized),
    queryFn: (signal) => listAdminReviews(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoAdminReviews()),
  });
}
