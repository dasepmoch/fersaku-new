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
  demoStaffMembers,
  listAdminRoles,
  listAdminStaffDirectory,
  listAdminUsers,
  listPermissionGroups,
  listStaffInvitations,
  listUserRoles,
  getAdminRole,
  getAdminUser,
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
import {
  demoAdminFulfillments,
  listAdminFulfillments,
} from "./fulfillments";
import { demoAdminReviews, listAdminReviews } from "./reviews";
import { demoMerchants, getMerchant, listMerchants } from "./merchants";
import {
  getMerchantFinanceSummary,
  listMerchantCredentials,
} from "./merchant-commands";
import { demoAdminOrders, getAdminOrder, listAdminOrders } from "./orders";
import {
  demoPaymentMismatchRows,
  demoPayments,
  getPayment,
  listPaymentMismatches,
  listPayments,
} from "./payments";
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

/** ADM-200 — server finance projection for detail metrics. */
export function useAdminMerchantFinance(merchantId: string) {
  const enabled = useAdminReadEnabled("merchants.read");
  return useAppQuery({
    queryKey: queryKeys.admin.merchantFinance(merchantId),
    queryFn: (signal) => getMerchantFinanceSummary(merchantId, signal),
    enabled: Boolean(merchantId) && enabled,
    surface: "private",
  });
}

/**
 * ADM-200 — masked credentials only.
 * BE currently requires kyc.review; fail-closed when claim missing on API path.
 */
export function useAdminMerchantCredentials(merchantId: string) {
  const claims = useSessionClaims();
  const isMock = getDomainSource("adminRead") === "mock";
  const enabled =
    Boolean(merchantId) &&
    (isMock ||
      claimsHavePermission(claims?.permissions, "kyc.review") ||
      claimsHavePermission(claims?.permissions, "merchants.read"));
  return useAppQuery({
    queryKey: queryKeys.admin.merchantCredentials(merchantId),
    queryFn: (signal) => listMerchantCredentials(merchantId, signal),
    enabled,
    surface: "private",
  });
}

/** Write permission gate for merchant status/API controls (ADM-110). */
export function useAdminMerchantWriteEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "merchants.write");
}

/**
 * ADM-210 — buyer support mutations currently ride POST /v1/admin/actions
 * (BE gate merchants.write). Fail-closed on API path without that claim.
 * No dedicated buyers.write in registry yet.
 */
export function useAdminBuyerSupportWriteEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "merchants.write");
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

/** ADM-300 — payment intent detail (payments.read). */
export function useAdminPayment(paymentIntentId: string) {
  const enabled = useAdminReadEnabled("payments.read");
  return useAppQuery({
    queryKey: queryKeys.admin.payment(paymentIntentId),
    queryFn: (signal) => getPayment(paymentIntentId, signal),
    enabled: Boolean(paymentIntentId) && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoPayments().find((p) => p.id === paymentIntentId) || null,
    ),
  });
}

/**
 * ADM-300 — provider-paid / local-pending mismatch feed (payments.read).
 * Read-only; empty list means aligned.
 */
export function useAdminPaymentMismatches() {
  const enabled = useAdminReadEnabled("payments.read");
  return useAppQuery({
    queryKey: queryKeys.admin.paymentMismatches(),
    queryFn: (signal) => listPaymentMismatches(signal),
    surface: "private",
    enabled,
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoPaymentMismatchRows(),
    ),
  });
}

/** ADM-300 — resend requires fulfillment.force on API path. */
export function useAdminOrderDeliveryResendEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "fulfillment.force");
}

/** ADM-300 — provider lookup uses payments.read (BE gate). */
export function useAdminProviderLookupEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "payments.read");
}

/** ADM-210 — purchase shells only (no delivery secret). */
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

/** ADM-210 — authoritative session list; screen must not clone into local state. */
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

export function useAdminRole(roleId: string) {
  const enabled = useAdminReadEnabled("roles.read");
  return useAppQuery({
    queryKey: queryKeys.admin.role(roleId),
    queryFn: (signal) => getAdminRole(roleId, signal),
    enabled: Boolean(roleId) && roleId !== "new" && enabled,
    surface: "private",
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoAdminRoles().find((r) => r.id === roleId) || null,
    ),
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

/** ADM-220 — user lookup (users.read). */
export function useAdminUsers(filters: { q?: string; limit?: number } = {}) {
  const enabled = useAdminReadEnabled("users.read");
  return useAppQuery({
    queryKey: queryKeys.admin.users(filters),
    queryFn: (signal) => listAdminUsers(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
  });
}

export function useAdminUser(userId: string) {
  const enabled = useAdminReadEnabled("users.read");
  return useAppQuery({
    queryKey: queryKeys.admin.user(userId),
    queryFn: (signal) => getAdminUser(userId, signal),
    enabled: Boolean(userId) && enabled,
    surface: "private",
  });
}

export function useAdminUserRoles(userId: string) {
  const enabled = useAdminReadEnabled("roles.read");
  return useAppQuery({
    queryKey: queryKeys.admin.userRoles(userId),
    queryFn: (signal) => listUserRoles(userId, signal),
    enabled: Boolean(userId) && enabled,
    surface: "private",
  });
}

/**
 * ADM-220 staff directory for users screen.
 * users.read for lookup; invitations require roles.assign on BE (fail soft).
 */
export function useAdminStaffDirectory() {
  const enabled = useAdminReadEnabled("users.read");
  return useAppQuery({
    queryKey: queryKeys.admin.users({ scope: "staff-directory" }),
    queryFn: (signal) => listAdminStaffDirectory(signal),
    surface: "private",
    enabled,
    placeholderData: mockPlaceholderData("adminRead", demoStaffMembers()),
  });
}

/** Staff invitations list — BE gate roles.assign. */
export function useAdminStaffInvitations() {
  const claims = useSessionClaims();
  const isMock = getDomainSource("adminRead") === "mock";
  const enabled =
    isMock || claimsHavePermission(claims?.permissions, "roles.assign");
  return useAppQuery({
    queryKey: queryKeys.admin.staffInvitations(),
    queryFn: (signal) => listStaffInvitations(signal),
    surface: "private",
    enabled,
  });
}

/** Write gate for role create/update/archive (roles.write). */
export function useAdminRolesWriteEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "roles.write");
}

/** Write gate for assign + staff invite (roles.assign). */
export function useAdminRolesAssignEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "roles.assign");
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

/** ADM-320 — inventory.reveal gate for privileged reveal control. */
export function useAdminInventoryRevealEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "inventory.reveal");
}

/** ADM-320 — fulfillment list (fulfillment.read). */
export function useAdminFulfillments(filters: AdminListFilters = {}) {
  const enabled = useAdminReadEnabled("fulfillment.read");
  const normalized = normalizeAdminListFilters(filters);
  return useAppQuery({
    queryKey: queryKeys.admin.fulfillment(normalized),
    queryFn: (signal) => listAdminFulfillments(filters, signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData(
      "adminRead",
      demoAdminFulfillments(),
    ),
  });
}

/** ADM-320 — force-fulfill / revoke require fulfillment.force on API path. */
export function useAdminFulfillmentForceEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "fulfillment.force");
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
