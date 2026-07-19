/**
 * ADM-320 — admin inventory redacted read + privileged per-item reveal.
 * List/detail always redacted; reveal is MFA+reason, component-local, no-store.
 * Never put secrets in query keys, logs, or localStorage.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  adminInventoryEnvelopeSchema,
  adminInventoryRevealEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type {
  AdminInventoryField,
  AdminStockItem,
  AdminStockItemSecret,
  AdminStockProduct,
} from "./contracts";
import {
  assertNoSecretsInAdminInventory,
  mapAdminInventoryRevealDto,
  mapAdminInventorySnapshotDto,
} from "./mappers";
import {
  mockInventorySchema,
  mockStockItemSecret,
  mockStockItems,
  mockStockProducts,
} from "./mock";
import { appendMockAuditEvent } from "./mock-audit";

type InventoryEnvelope = z.infer<typeof adminInventoryEnvelopeSchema>;
type RevealEnvelope = z.infer<typeof adminInventoryRevealEnvelopeSchema>;

export type AdminInventorySnapshot = {
  products: AdminStockProduct[];
  items: AdminStockItem[];
  schema: AdminInventoryField[];
};

export function demoInventory(): AdminInventorySnapshot {
  const snap = {
    products: mockStockProducts(),
    items: mockStockItems(),
    schema: mockInventorySchema(),
  };
  assertNoSecretsInAdminInventory(snap);
  return snap;
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
  /** Optional explicit proof; otherwise requireRecentMfa attaches memory proof. */
  recentMfaProof?: string;
};

/** Privileged, individually audited secret reveal; never part of list reads. */
export async function revealInventoryItem(
  input: RevealInventoryItemInput,
  signal?: AbortSignal,
): Promise<AdminStockItemSecret> {
  const itemId = input.itemId.trim();
  const reason = input.reason.trim();
  if (!itemId) throw new Error("itemId required");
  if (reason.length < 12) {
    throw new Error("A reason of at least 12 characters is required.");
  }

  if (shouldUseMockFixtures("adminWrite")) {
    const secret = mockStockItemSecret(itemId);
    if (!secret) throw new Error("Stock item was not found.");
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "inventory.item.secret.reveal",
      target: itemId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return secret;
  }

  const response = await apiRequest<RevealEnvelope, { reason: string }>(
    `/v1/admin/inventory/items/${encodeURIComponent(itemId)}/reveal`,
    {
      schema: adminInventoryRevealEnvelopeSchema,
      method: "POST",
      body: { reason },
      signal,
      auditReason: reason,
      requireRecentMfa: true,
      recentMfaProof: input.recentMfaProof,
    },
  );
  return mapAdminInventoryRevealDto(response.data);
}

/** Whether adminWrite domain is live API (for reveal permission gates). */
export function isInventoryRevealApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}
