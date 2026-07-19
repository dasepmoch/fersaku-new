/**
 * ADM-350 — admin provider-callbacks + seller-webhook-deliveries transport.
 * Domains: adminRead (list/detail), adminWrite (replay/retry).
 * Never cache raw payload/signature/secret body.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  adminProviderCallbackEnvelopeSchema,
  adminProviderCallbackListEnvelopeSchema,
  adminProviderCallbackReplayRequestSchema,
  adminSellerWebhookDeliveryEnvelopeSchema,
  adminSellerWebhookDeliveryListEnvelopeSchema,
  adminSellerWebhookDeliveryRetryRequestSchema,
  type AdminProviderCallbackDto,
  type AdminSellerWebhookDeliveryDto,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { appendClientAuditEvent } from "@/features/admin/data/client-audit";
import type {
  ProviderCallbackRow,
  SellerWebhookDeliveryRow,
  WebhookRow,
} from "./data";
import {
  mapProviderCallbackDto,
  mapProviderCallbackListDto,
  mapSellerWebhookDeliveryDto,
  mapSellerWebhookDeliveryListDto,
  mergeWebhookRows,
} from "./mappers";
import { demoAdminWebhookById, demoAdminWebhooks } from "./mock";

type CallbackListEnvelope = z.infer<
  typeof adminProviderCallbackListEnvelopeSchema
>;
type CallbackEnvelope = z.infer<typeof adminProviderCallbackEnvelopeSchema>;
type DeliveryListEnvelope = z.infer<
  typeof adminSellerWebhookDeliveryListEnvelopeSchema
>;
type DeliveryEnvelope = z.infer<
  typeof adminSellerWebhookDeliveryEnvelopeSchema
>;

/** Bounded first page (BE AdminList limit=50). */
export const ADMIN_WEBHOOKS_LIMIT = 50;

export type AdminProviderCallbackFilters = {
  limit?: number;
};

export type AdminSellerDeliveryFilters = {
  status?: string;
  merchantId?: string;
  limit?: number;
};

export type ReplayProviderCallbackInput = {
  callbackId: string;
  reason: string;
  idempotencyKey?: string;
};

export type RetrySellerWebhookDeliveryInput = {
  deliveryId: string;
  reason: string;
  idempotencyKey?: string;
};

export type WebhookCommandResult = {
  row: WebhookRow;
  requestId: string;
};

export type AdminWebhookComposeResult = {
  rows: WebhookRow[];
  callbackError: string | null;
  deliveryError: string | null;
};

export function isAdminWebhooksApiDomain(): boolean {
  return getDomainSource("adminRead") === "api";
}

export function isAdminWebhooksWriteApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

export async function listAdminProviderCallbacks(
  filters: AdminProviderCallbackFilters = {},
  signal?: AbortSignal,
): Promise<ProviderCallbackRow[]> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoAdminWebhooks().filter(
      (r): r is ProviderCallbackRow => r.kind === "PROVIDER_CALLBACK",
    );
  }

  const response = await apiRequest<CallbackListEnvelope>(
    "/v1/admin/provider-callbacks",
    {
      schema: adminProviderCallbackListEnvelopeSchema,
      signal,
    },
  );
  const items = Array.isArray(response.data) ? response.data : [];
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_WEBHOOKS_LIMIT),
  );
  return mapProviderCallbackListDto(items.slice(0, limit));
}

export async function getAdminProviderCallback(
  callbackId: string,
  signal?: AbortSignal,
): Promise<ProviderCallbackRow | null> {
  const id = callbackId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("adminRead")) {
    const row = demoAdminWebhookById(id);
    return row?.kind === "PROVIDER_CALLBACK" ? row : null;
  }

  const response = await apiRequest<CallbackEnvelope>(
    `/v1/admin/provider-callbacks/${encodeURIComponent(id)}`,
    {
      schema: adminProviderCallbackEnvelopeSchema,
      signal,
    },
  );
  return mapProviderCallbackDto(response.data as AdminProviderCallbackDto);
}

export async function listAdminSellerWebhookDeliveries(
  filters: AdminSellerDeliveryFilters = {},
  signal?: AbortSignal,
): Promise<SellerWebhookDeliveryRow[]> {
  if (shouldUseMockFixtures("adminRead")) {
    let rows = demoAdminWebhooks().filter(
      (r): r is SellerWebhookDeliveryRow => r.kind === "SELLER_DELIVERY",
    );
    if (filters.status?.trim()) {
      const st = filters.status.trim().toUpperCase();
      rows = rows.filter((r) => r.deliveryStatus.toUpperCase() === st);
    }
    return rows;
  }

  const query: Record<string, string | undefined> = {};
  if (filters.status?.trim()) query.status = filters.status.trim();
  if (filters.merchantId?.trim()) query.merchantId = filters.merchantId.trim();

  const response = await apiRequest<DeliveryListEnvelope>(
    "/v1/admin/seller-webhook-deliveries",
    {
      schema: adminSellerWebhookDeliveryListEnvelopeSchema,
      query,
      signal,
    },
  );
  const items = Array.isArray(response.data) ? response.data : [];
  const limit = Math.min(
    100,
    Math.max(1, filters.limit ?? ADMIN_WEBHOOKS_LIMIT),
  );
  return mapSellerWebhookDeliveryListDto(items.slice(0, limit));
}

export async function getAdminSellerWebhookDelivery(
  deliveryId: string,
  signal?: AbortSignal,
): Promise<SellerWebhookDeliveryRow | null> {
  const id = deliveryId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("adminRead")) {
    const row = demoAdminWebhookById(id);
    return row?.kind === "SELLER_DELIVERY" ? row : null;
  }

  const response = await apiRequest<DeliveryEnvelope>(
    `/v1/admin/seller-webhook-deliveries/${encodeURIComponent(id)}`,
    {
      schema: adminSellerWebhookDeliveryEnvelopeSchema,
      signal,
    },
  );
  return mapSellerWebhookDeliveryDto(
    response.data as AdminSellerWebhookDeliveryDto,
  );
}

/**
 * Compose both resources for the existing dual-source table.
 * Partial failure is reported; successful source is still returned.
 */
export async function listAdminWebhookConsole(
  signal?: AbortSignal,
): Promise<AdminWebhookComposeResult> {
  if (shouldUseMockFixtures("adminRead")) {
    return {
      rows: demoAdminWebhooks(),
      callbackError: null,
      deliveryError: null,
    };
  }

  const [cbSettled, delSettled] = await Promise.allSettled([
    listAdminProviderCallbacks({ limit: ADMIN_WEBHOOKS_LIMIT }, signal),
    listAdminSellerWebhookDeliveries({ limit: ADMIN_WEBHOOKS_LIMIT }, signal),
  ]);

  const callbacks = cbSettled.status === "fulfilled" ? cbSettled.value : [];
  const deliveries = delSettled.status === "fulfilled" ? delSettled.value : [];

  return {
    rows: mergeWebhookRows(callbacks, deliveries),
    callbackError:
      cbSettled.status === "rejected"
        ? errorMessage(cbSettled.reason, "Provider callbacks unavailable")
        : null,
    deliveryError:
      delSettled.status === "rejected"
        ? errorMessage(delSettled.reason, "Seller deliveries unavailable")
        : null,
  };
}

function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return fallback;
}

/**
 * POST /v1/admin/provider-callbacks/{callbackId}/replay
 * Permission: provider_callbacks.replay. Rejects seller delivery IDs server-side.
 */
export async function replayAdminProviderCallback(
  input: ReplayProviderCallbackInput,
  signal?: AbortSignal,
): Promise<WebhookCommandResult> {
  const callbackId = input.callbackId.trim();
  const reason = input.reason.trim();
  if (!callbackId) throw new Error("callbackId required");
  if (reason.length < 12) {
    throw new Error("A reason of at least 12 characters is required for audit");
  }

  const body = adminProviderCallbackReplayRequestSchema.parse({ reason });
  const idempotencyKey = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const existing =
      demoAdminWebhookById(callbackId) ??
      demoAdminWebhooks().find((r) => r.kind === "PROVIDER_CALLBACK")!;
    if (existing.kind !== "PROVIDER_CALLBACK") {
      throw new Error("Not a provider callback");
    }
    appendClientAuditEvent({
      actor: "admin@fersaku.id",
      action: "xendit.callback.retried",
      target: callbackId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      row: {
        ...existing,
        http: "202",
        attempts: existing.attempts + 1,
        age: "now",
      },
      requestId: `mock_cb_replay_${callbackId}`,
    };
  }

  const response = await apiRequest<CallbackEnvelope, { reason: string }>(
    `/v1/admin/provider-callbacks/${encodeURIComponent(callbackId)}/replay`,
    {
      method: "POST",
      body,
      schema: adminProviderCallbackEnvelopeSchema,
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );

  return {
    row: mapProviderCallbackDto(response.data as AdminProviderCallbackDto),
    requestId: response.meta.requestId,
  };
}

/**
 * POST /v1/admin/seller-webhook-deliveries/{deliveryId}/retry
 * Permission: seller_webhook_deliveries.retry. Rejects inbound provider IDs.
 */
export async function retryAdminSellerWebhookDelivery(
  input: RetrySellerWebhookDeliveryInput,
  signal?: AbortSignal,
): Promise<WebhookCommandResult> {
  const deliveryId = input.deliveryId.trim();
  const reason = input.reason.trim();
  if (!deliveryId) throw new Error("deliveryId required");
  if (reason.length < 12) {
    throw new Error("A reason of at least 12 characters is required for audit");
  }

  const body = adminSellerWebhookDeliveryRetryRequestSchema.parse({ reason });
  const idempotencyKey = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (shouldUseMockFixtures("adminWrite")) {
    const existing =
      demoAdminWebhookById(deliveryId) ??
      demoAdminWebhooks().find((r) => r.kind === "SELLER_DELIVERY")!;
    if (existing.kind !== "SELLER_DELIVERY") {
      throw new Error("Not a seller delivery");
    }
    appendClientAuditEvent({
      actor: "admin@fersaku.id",
      action: "seller.webhook_delivery.retried",
      target: deliveryId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      row: {
        ...existing,
        http: "200",
        deliveryStatus: "DELIVERED",
        attempts: existing.attempts + 1,
        age: "now",
      },
      requestId: `mock_wh_retry_${deliveryId}`,
    };
  }

  const response = await apiRequest<DeliveryEnvelope, { reason: string }>(
    `/v1/admin/seller-webhook-deliveries/${encodeURIComponent(deliveryId)}/retry`,
    {
      method: "POST",
      body,
      schema: adminSellerWebhookDeliveryEnvelopeSchema,
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );

  return {
    row: mapSellerWebhookDeliveryDto(
      response.data as AdminSellerWebhookDeliveryDto,
    ),
    requestId: response.meta.requestId,
  };
}
