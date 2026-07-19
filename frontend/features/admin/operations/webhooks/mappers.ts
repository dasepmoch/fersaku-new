/**
 * ADM-350 — admin provider-callback + seller-delivery DTO → existing table rows.
 * Discriminated union; never map raw payload/signature/secret body.
 */

import type {
  AdminProviderCallbackDto,
  AdminSellerWebhookDeliveryDto,
} from "@/shared/api/schemas";
import type {
  ProviderCallbackRow,
  SellerWebhookDeliveryRow,
  WebhookRow,
} from "./data";

/** Stable unique row key: kind + resource id (avoids cross-namespace collisions). */
export function webhookRowKey(row: WebhookRow): string {
  return `${row.kind}:${row.id}`;
}

export function webhookRowKeyFromParts(
  kind: WebhookRow["kind"],
  id: string,
): string {
  return `${kind}:${id}`;
}

function formatAge(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatReceivedAt(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(t);
  } catch {
    return iso;
  }
}

/** Map BE processingState → table HTTP-ish column (snapshot chrome). */
export function mapCallbackHttpLabel(
  state: string,
  failureCode?: string,
): string {
  const s = state.toUpperCase();
  if (s === "PROCESSED") return "200";
  if (s === "PROCESSING" || s === "ACCEPTED") return "202";
  if (s === "FAILED") return failureCode?.trim() || "Failed";
  if (s === "QUARANTINED") return "Quarantined";
  return state;
}

export function mapCallbackProviderStatus(
  dto: AdminProviderCallbackDto,
): string {
  if (dto.mismatchCode) return "PAID";
  const t = (dto.normalizedType ?? "").toLowerCase();
  if (t.includes("paid") || t.includes("success") || t.includes("completed")) {
    if (t.includes("withdraw") || t.includes("payout")) return "COMPLETED";
    return "PAID";
  }
  if (t.includes("fail") || t.includes("expire")) return "FAILED";
  return dto.processingState;
}

export function mapCallbackOrderStatus(dto: AdminProviderCallbackDto): string {
  if (dto.mismatchCode) return "Pending";
  const s = dto.processingState.toUpperCase();
  if (s === "PROCESSED") return "Fulfilled";
  if (s === "FAILED" || s === "QUARANTINED") return "Pending";
  return "Pending";
}

export function mapCallbackEventLabel(dto: AdminProviderCallbackDto): string {
  if (dto.normalizedType?.trim()) return dto.normalizedType.trim();
  return dto.providerEventId?.trim() || "provider.callback";
}

export function mapProviderCallbackDto(
  dto: AdminProviderCallbackDto,
): ProviderCallbackRow {
  const state = dto.processingState.toUpperCase();
  const canonical = [
    dto.provider ?? "xendit",
    dto.accountScope ?? "main",
    dto.paymentMode ?? "LIVE",
    dto.providerEventId ?? dto.callbackId,
  ].join(":");

  return {
    kind: "PROVIDER_CALLBACK",
    id: dto.callbackId,
    source: "Xendit",
    event: mapCallbackEventLabel(dto),
    order: dto.paymentIntentId?.trim() || "—",
    http: mapCallbackHttpLabel(dto.processingState, dto.failureCode),
    providerStatus: mapCallbackProviderStatus(dto),
    providerReference:
      dto.providerReference?.trim() || dto.providerEventId || "—",
    amount: 0,
    receivedAt: formatReceivedAt(dto.receivedAt),
    signatureValidation: "VERIFIED",
    canonicalEventKey: canonical,
    rawPayloadRef: dto.payloadDigest
      ? `digest:${dto.payloadDigest.slice(0, 24)}`
      : "redacted",
    orderStatus: mapCallbackOrderStatus(dto),
    age: formatAge(dto.receivedAt),
    attempts: Math.max(
      0,
      Math.trunc(dto.attemptCount ?? 0) + Math.trunc(dto.replayCount ?? 0),
    ),
    processingState: state,
    payloadDigest: dto.payloadDigest,
    mismatchCode: dto.mismatchCode,
    failureCode: dto.failureCode,
    paymentIntentId: dto.paymentIntentId,
    providerEventId: dto.providerEventId,
  };
}

export function mapProviderCallbackListDto(
  items: AdminProviderCallbackDto[],
): ProviderCallbackRow[] {
  return items.map(mapProviderCallbackDto);
}

function mapDeliveryHttpLabel(
  status: string,
  lastHttpStatus?: number,
  lastHttpClass?: string,
): string {
  if (lastHttpStatus != null && Number.isFinite(lastHttpStatus)) {
    return String(Math.trunc(lastHttpStatus));
  }
  if (lastHttpClass?.trim()) return lastHttpClass.trim();
  const s = status.toUpperCase();
  if (s === "DELIVERED") return "200";
  if (s === "QUEUED" || s === "RETRYING") return "Retrying";
  if (s === "DEAD_LETTER") return "500";
  if (s === "CANCELLED") return "Cancelled";
  return status;
}

export function mapSellerWebhookDeliveryDto(
  dto: AdminSellerWebhookDeliveryDto,
): SellerWebhookDeliveryRow {
  return {
    kind: "SELLER_DELIVERY",
    id: dto.deliveryId,
    source: "Seller",
    event: dto.eventType?.trim() || "webhook.event",
    order: dto.orderId?.trim() || dto.paymentIntentId?.trim() || "—",
    http: mapDeliveryHttpLabel(
      dto.status,
      dto.lastHttpStatus,
      dto.lastHttpClass,
    ),
    deliveryStatus: dto.status,
    orderStatus: dto.status === "DELIVERED" ? "Fulfilled" : "Pending",
    age: formatAge(dto.updatedAt ?? dto.createdAt),
    attempts: Math.max(0, Math.trunc(dto.attemptCount ?? 0)),
    endpointHost: dto.endpointHost,
    endpointId: dto.endpointId,
    merchantId: dto.merchantId,
    eventId: dto.eventId,
    deadLetterReason: dto.deadLetterReason,
    payloadHash: dto.payloadHash,
  };
}

export function mapSellerWebhookDeliveryListDto(
  items: AdminSellerWebhookDeliveryDto[],
): SellerWebhookDeliveryRow[] {
  return items.map(mapSellerWebhookDeliveryDto);
}

/** Merge two independent sources; stable sort by age label is not authoritative — preserve BE order per kind then concatenate. */
export function mergeWebhookRows(
  callbacks: ProviderCallbackRow[],
  deliveries: SellerWebhookDeliveryRow[],
): WebhookRow[] {
  return [...callbacks, ...deliveries];
}
