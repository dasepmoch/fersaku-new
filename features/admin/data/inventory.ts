import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type {
  AdminInventoryField,
  AdminStockItem,
  AdminStockItemSecret,
  AdminStockProduct,
} from "./contracts";
import {
  mockInventorySchema,
  mockStockItemSecret,
  mockStockItems,
  mockStockProducts,
} from "./mock";
import { appendMockAuditEvent } from "./mock-audit";

export type AdminInventorySnapshot = {
  products: AdminStockProduct[];
  items: AdminStockItem[];
  schema: AdminInventoryField[];
};

export function demoInventory(): AdminInventorySnapshot {
  return {
    products: mockStockProducts(),
    items: mockStockItems(),
    schema: mockInventorySchema(),
  };
}

export async function getInventory(
  signal?: AbortSignal,
): Promise<AdminInventorySnapshot> {
  if (!isLiveApi()) return demoInventory();
  const response = await apiRequest<ApiEnvelope<AdminInventorySnapshot>>(
    "/v1/admin/inventory",
    { signal },
  );
  return response.data;
}

export type RevealInventoryItemInput = {
  itemId: string;
  reason: string;
  recentMfaProof: string;
};

/** Privileged, individually audited secret reveal; never part of list reads. */
export async function revealInventoryItem(
  input: RevealInventoryItemInput,
  signal?: AbortSignal,
): Promise<AdminStockItemSecret> {
  if (input.reason.trim().length < 12 || !input.recentMfaProof) {
    throw new Error("A reason and recent MFA proof are required.");
  }
  if (!isLiveApi()) {
    const secret = mockStockItemSecret(input.itemId);
    if (!secret) throw new Error("Stock item was not found.");
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "inventory.item.secret.reveal",
      target: input.itemId,
      ip: "mock-admin-session",
      result: "Success",
      context: input.reason.trim(),
    });
    return secret;
  }
  const response = await apiRequest<
    ApiEnvelope<AdminStockItemSecret>,
    { reason: string }
  >(`/v1/admin/inventory/items/${encodeURIComponent(input.itemId)}/reveal`, {
    method: "POST",
    body: { reason: input.reason.trim() },
    signal,
    auditReason: input.reason.trim(),
    recentMfaProof: input.recentMfaProof,
  });
  return response.data;
}
