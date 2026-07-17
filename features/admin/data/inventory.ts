/**
 * ADM-120 — admin inventory snapshot read foundation (inventory.read).
 * Reveal remains privileged mutation path.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  adminInventoryEnvelopeSchema,
  structuralEnvelopeSchema,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  AdminInventoryField,
  AdminStockItem,
  AdminStockItemSecret,
  AdminStockProduct,
} from "./contracts";
import { mapAdminInventorySnapshotDto } from "./mappers";
import {
  mockInventorySchema,
  mockStockItemSecret,
  mockStockItems,
  mockStockProducts,
} from "./mock";
import { appendMockAuditEvent } from "./mock-audit";

type InventoryEnvelope = z.infer<typeof adminInventoryEnvelopeSchema>;

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
  if (shouldUseMockFixtures("adminRead")) return demoInventory();
  const response = await apiRequest<InventoryEnvelope>("/v1/admin/inventory", {
    schema: adminInventoryEnvelopeSchema,
    signal,
  });
  return mapAdminInventorySnapshotDto(response.data);
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
  if (shouldUseMockFixtures("adminRead")) {
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
    schema: structuralEnvelopeSchema,
    method: "POST",
    body: { reason: input.reason.trim() },
    signal,
    auditReason: input.reason.trim(),
    recentMfaProof: input.recentMfaProof,
  });
  return response.data;
}
