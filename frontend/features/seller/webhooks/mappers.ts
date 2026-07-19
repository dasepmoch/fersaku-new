/**
 * Webhook transport DTO → existing list/test view (SEL-320).
 * Raw signingSecret never mapped into list/query models.
 */

import type {
  SellerWebhookDeliveryDto,
  SellerWebhookEndpointDto,
} from "@/shared/api/schemas";
import type {
  CreateSellerWebhookInput,
  SellerWebhookDelivery,
  SellerWebhookEndpoint,
  UpdateSellerWebhookInput,
  WebhookSecretClaimOffer,
  WebhookSigningSecretReveal,
} from "./contracts";
import type {
  SellerWebhookClaimOfferData,
  SellerWebhookCreateRequest,
  SellerWebhookSecretClaimData,
  SellerWebhookUpdateRequest,
} from "@/shared/api/schemas";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PENDING_SECRET_CLAIM: "Pending claim",
  PENDING_VERIFICATION: "Pending",
  SUSPENDED: "Suspended",
  REVOKED: "Revoked",
};

export function mapWebhookStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function mapWebhookEndpointDto(
  dto: SellerWebhookEndpointDto,
): SellerWebhookEndpoint {
  const url = dto.url?.trim() || "";
  const urlHost =
    dto.urlHost?.trim() ||
    (url ? safeHost(url) : "") ||
    "—";
  return {
    id: dto.id,
    storeId: dto.storeId,
    merchantId: dto.merchantId,
    paymentMode: dto.paymentMode,
    url: url || `https://${urlHost}`,
    urlHost,
    status: dto.status,
    statusLabel: mapWebhookStatusLabel(dto.status),
    configVersion: dto.configVersion ?? 1,
    eventAllowlist: dto.eventAllowlist ?? [],
    currentSecretVersion: dto.currentSecretVersion,
    failureCount: Math.max(0, Math.trunc(dto.failureCount ?? 0)),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function mapWebhookEndpointListDto(
  items: SellerWebhookEndpointDto[],
): SellerWebhookEndpoint[] {
  return items.map(mapWebhookEndpointDto);
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

export function formatDeliveryResponseLabel(
  status: string,
  lastHttpStatus?: number,
): string {
  if (lastHttpStatus != null && Number.isFinite(lastHttpStatus)) {
    const code = Math.trunc(lastHttpStatus);
    if (code >= 200 && code < 300) return `${code} OK`;
    return `${code} Error`;
  }
  if (status === "DELIVERED") return "200 OK";
  if (status === "QUEUED" || status === "RETRYING") return status;
  if (status === "DEAD_LETTER") return "Failed";
  return status;
}

export function formatDeliveryLatencyLabel(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const n = Math.max(0, Math.trunc(ms));
  if (n >= 1000) {
    const s = (n / 1000).toFixed(1).replace(/\.0$/, "");
    return `${s} s`;
  }
  return `${n} ms`;
}

export function mapWebhookDeliveryDto(
  dto: SellerWebhookDeliveryDto,
): SellerWebhookDelivery {
  return {
    deliveryId: dto.deliveryId,
    endpointId: dto.endpointId,
    eventType: dto.eventType,
    eventId: dto.eventId,
    status: dto.status,
    isTest: Boolean(dto.isTest),
    attemptCount: Math.max(0, Math.trunc(dto.attemptCount ?? 0)),
    lastHttpStatus: dto.lastHttpStatus,
    lastLatencyMs: dto.lastLatencyMs,
    responseLabel: formatDeliveryResponseLabel(
      dto.status,
      dto.lastHttpStatus,
    ),
    latencyLabel: formatDeliveryLatencyLabel(dto.lastLatencyMs),
    createdAt: dto.createdAt,
  };
}

export function mapWebhookDeliveryListDto(
  items: SellerWebhookDeliveryDto[],
): SellerWebhookDelivery[] {
  return items.map(mapWebhookDeliveryDto);
}

export function mapClaimOfferDto(
  data: SellerWebhookClaimOfferData,
): WebhookSecretClaimOffer {
  return {
    endpoint: mapWebhookEndpointDto(data.endpoint),
    claimToken: data.claimToken,
    claimExpiresAt: data.claimExpiresAt,
    secretVersion: data.secretVersion,
  };
}

/**
 * Strip signingSecret from any accidental spread into cacheable models.
 * Callers must hold reveal only in component state.
 */
export function mapSecretClaimDto(
  data: SellerWebhookSecretClaimData,
): WebhookSigningSecretReveal {
  return {
    signingSecret: data.signingSecret,
    fingerprint: data.fingerprint,
    secretVersion: data.secretVersion,
    endpoint: data.endpoint
      ? mapWebhookEndpointDto(data.endpoint)
      : undefined,
  };
}

export function toCreateWebhookRequestBody(
  input: CreateSellerWebhookInput,
): SellerWebhookCreateRequest {
  const body: SellerWebhookCreateRequest = {
    url: input.url.trim(),
    paymentMode: input.paymentMode,
  };
  if (input.eventAllowlist?.length) {
    body.eventAllowlist = input.eventAllowlist;
  }
  return body;
}

export function toUpdateWebhookRequestBody(
  input: UpdateSellerWebhookInput,
): SellerWebhookUpdateRequest {
  const body: SellerWebhookUpdateRequest = {};
  if (input.url != null) body.url = input.url.trim();
  if (input.eventAllowlist != null) body.eventAllowlist = input.eventAllowlist;
  if (input.disable != null) body.disable = input.disable;
  if (input.reason != null) body.reason = input.reason;
  return body;
}

/** Endpoint option label for existing select: `Production — host/path`. */
export function endpointSelectLabel(ep: SellerWebhookEndpoint): string {
  const mode =
    ep.paymentMode === "LIVE"
      ? "Production"
      : ep.paymentMode === "SANDBOX"
        ? "Staging"
        : ep.paymentMode;
  const path = ep.url.replace(/^https?:\/\//, "");
  return `${mode} — ${path}`;
}
