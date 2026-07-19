/**
 * Admin-only mock adapter.
 *
 * Screens consume the typed functions exposed by `features/admin/data`; this
 * module is the sole place where the legacy fixture modules are bridged while
 * the Go API is not available. Keeping the bridge here makes the migration to
 * a live adapter a data-layer change rather than a presentation change.
 */
import {
  adminOrders,
  adminRoles,
  auditEvents,
  merchants,
  permissionGroups,
  paymentIntents,
  platformVolume,
  withdrawalReviews,
} from "@/lib/admin-mock-data";
import { buyerPurchases, buyerSessions } from "@/lib/buyer-mock-data";
import {
  canvaSchema,
  stockItems,
  stockProducts,
} from "@/lib/inventory-mock-data";
import { reviews } from "@/lib/reviews-mock-data";
import type {
  AdminAuditEvent,
  AdminBuyerPurchase,
  AdminBuyerSession,
  AdminInventoryField,
  AdminMerchant,
  AdminOrder,
  AdminPermissionGroup,
  AdminPaymentIntent,
  AdminRole,
  AdminStockItem,
  AdminStockItemSecret,
  AdminStockProduct,
  AdminWithdrawal,
  AdminReview,
} from "./contracts";

export function mockMerchants(): AdminMerchant[] {
  return merchants.map((merchant) => ({ ...merchant })) as AdminMerchant[];
}

export function mockOrders(): AdminOrder[] {
  return adminOrders.map((order) => ({ ...order })) as AdminOrder[];
}

export function mockPayments(): AdminPaymentIntent[] {
  return paymentIntents.map((payment) => ({
    ...payment,
  })) as AdminPaymentIntent[];
}

export function mockWithdrawals(): AdminWithdrawal[] {
  return withdrawalReviews.map((withdrawal) => ({
    ...withdrawal,
  })) as AdminWithdrawal[];
}

export function mockAuditEvents(): AdminAuditEvent[] {
  return auditEvents.map((event) => ({ ...event })) as AdminAuditEvent[];
}

export function mockPlatformVolume(): number[] {
  return [...platformVolume];
}

export function mockRoles(): AdminRole[] {
  return adminRoles.map((role) => ({ ...role })) as AdminRole[];
}

export function mockPermissionGroups(): AdminPermissionGroup[] {
  return permissionGroups.map((group) => ({
    ...group,
    permissions: group.permissions.map(([permission, description]) => [
      permission,
      description,
    ]),
  })) as AdminPermissionGroup[];
}

export function mockBuyerPurchases(): AdminBuyerPurchase[] {
  return buyerPurchases.map(({ orderId, product, seller, status }) => ({
    orderId,
    product,
    seller,
    status,
  }));
}

export function mockBuyerSessions(): AdminBuyerSession[] {
  return buyerSessions.map((session) => ({ ...session }));
}

export function mockStockProducts(): AdminStockProduct[] {
  return stockProducts.map((product) => ({
    ...product,
  })) as AdminStockProduct[];
}

export function mockStockItems(): AdminStockItem[] {
  return stockItems.map(({ values, ...item }) => ({
    ...item,
    schemaPreview: Object.keys(values).join(" | "),
  })) as AdminStockItem[];
}

export function mockStockItemSecret(
  itemId: string,
): AdminStockItemSecret | null {
  const item = stockItems.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  return {
    itemId,
    values: { ...item.values },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

export function mockInventorySchema(): AdminInventoryField[] {
  return canvaSchema.map((field) => ({ ...field })) as AdminInventoryField[];
}

export function mockReviews(): AdminReview[] {
  return reviews.map((review) => ({ ...review })) as AdminReview[];
}
