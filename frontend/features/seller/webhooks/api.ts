/**
 * SEL-320 — seller outbound webhook transport adapters.
 * Domain gate: sellerOperations. Raw signingSecret never enters query cache.
 */

import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  sellerWebhookClaimOfferEnvelopeSchema,
  sellerWebhookCreateRequestSchema,
  sellerWebhookDeliveryEnvelopeSchema,
  sellerWebhookDeliveryListEnvelopeSchema,
  sellerWebhookEndpointEnvelopeSchema,
  sellerWebhookEndpointListEnvelopeSchema,
  sellerWebhookSecretClaimEnvelopeSchema,
  sellerWebhookSecretClaimRequestSchema,
  sellerWebhookUpdateRequestSchema,
  type SellerWebhookCreateRequest,
  type SellerWebhookUpdateRequest,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  CreateSellerWebhookInput,
  SellerWebhookDelivery,
  SellerWebhookEndpoint,
  TestWebhookResult,
  UpdateSellerWebhookInput,
  WebhookSecretClaimOffer,
  WebhookSigningSecretReveal,
} from "./contracts";
import {
  mapClaimOfferDto,
  mapSecretClaimDto,
  mapWebhookDeliveryDto,
  mapWebhookDeliveryListDto,
  mapWebhookEndpointDto,
  mapWebhookEndpointListDto,
  toCreateWebhookRequestBody,
  toUpdateWebhookRequestBody,
} from "./mappers";
import {
  demoWebhookDeliveries,
  demoWebhookEndpoints,
  mockWebhookClaimOffer,
  mockWebhookSecretReveal,
} from "./mock";

type EndpointListEnvelope = z.infer<
  typeof sellerWebhookEndpointListEnvelopeSchema
>;
type EndpointEnvelope = z.infer<typeof sellerWebhookEndpointEnvelopeSchema>;
type ClaimOfferEnvelope = z.infer<typeof sellerWebhookClaimOfferEnvelopeSchema>;
type SecretClaimEnvelope = z.infer<
  typeof sellerWebhookSecretClaimEnvelopeSchema
>;
type DeliveryListEnvelope = z.infer<
  typeof sellerWebhookDeliveryListEnvelopeSchema
>;
type DeliveryEnvelope = z.infer<typeof sellerWebhookDeliveryEnvelopeSchema>;

export function isSellerWebhooksApiDomain(): boolean {
  return getDomainSource("sellerOperations") === "api";
}

function isMockMode(): boolean {
  return shouldUseMockFixtures("sellerOperations");
}

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

/**
 * Store-scoped endpoint list (masked secret metadata only).
 * Foreign store → resource_not_found rethrow (safe 404).
 */
export async function listSellerWebhooks(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWebhookEndpoint[]> {
  if (isMockMode()) {
    return demoWebhookEndpoints(storeId);
  }

  const response = await apiRequest<EndpointListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/webhooks`,
    {
      schema: sellerWebhookEndpointListEnvelopeSchema,
      signal,
    },
  );
  return mapWebhookEndpointListDto(response.data.endpoints);
}

/**
 * Delivery history (no raw payload body/secrets). Bounded first page from BE.
 */
export async function listSellerWebhookDeliveries(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerWebhookDelivery[]> {
  if (isMockMode()) {
    return demoWebhookDeliveries(storeId);
  }

  const response = await apiRequest<DeliveryListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/webhooks/deliveries`,
    {
      schema: sellerWebhookDeliveryListEnvelopeSchema,
      signal,
    },
  );
  return mapWebhookDeliveryListDto(response.data.deliveries);
}

/**
 * Create endpoint → one-time claimToken (component-local).
 * Does not return raw signingSecret.
 */
export async function createSellerWebhook(
  storeId: string,
  input: CreateSellerWebhookInput,
  signal?: AbortSignal,
): Promise<WebhookSecretClaimOffer> {
  if (isMockMode()) {
    return mockWebhookClaimOffer(storeId, input.url, input.paymentMode);
  }

  const body = sellerWebhookCreateRequestSchema.parse(
    toCreateWebhookRequestBody(input),
  ) as SellerWebhookCreateRequest;

  const response = await apiRequest<
    ClaimOfferEnvelope,
    SellerWebhookCreateRequest
  >(`/v1/stores/${encodeURIComponent(storeId)}/webhooks`, {
    method: "POST",
    body,
    schema: sellerWebhookClaimOfferEnvelopeSchema,
    signal,
    idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
  });
  return mapClaimOfferDto(response.data);
}

export async function updateSellerWebhook(
  storeId: string,
  endpointId: string,
  input: UpdateSellerWebhookInput,
  signal?: AbortSignal,
): Promise<SellerWebhookEndpoint> {
  if (isMockMode()) {
    const existing =
      demoWebhookEndpoints(storeId).find((e) => e.id === endpointId) ??
      demoWebhookEndpoints(storeId)[0]!;
    return {
      ...existing,
      id: endpointId,
      url: input.url?.trim() ?? existing.url,
      eventAllowlist: input.eventAllowlist ?? existing.eventAllowlist,
      status: input.disable ? "SUSPENDED" : existing.status,
      statusLabel: input.disable ? "Suspended" : existing.statusLabel,
    };
  }

  const body = sellerWebhookUpdateRequestSchema.parse(
    toUpdateWebhookRequestBody(input),
  ) as SellerWebhookUpdateRequest;

  const response = await apiRequest<
    EndpointEnvelope,
    SellerWebhookUpdateRequest
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/webhooks/${encodeURIComponent(endpointId)}`,
    {
      method: "PATCH",
      body,
      schema: sellerWebhookEndpointEnvelopeSchema,
      signal,
    },
  );
  return mapWebhookEndpointDto(response.data);
}

/**
 * Rotate signing secret (independent of API key) → new claimToken.
 */
export async function rotateSellerWebhookSecret(
  storeId: string,
  endpointId: string,
  signal?: AbortSignal,
): Promise<WebhookSecretClaimOffer> {
  if (isMockMode()) {
    const ep =
      demoWebhookEndpoints(storeId).find((e) => e.id === endpointId) ??
      demoWebhookEndpoints(storeId)[0]!;
    return {
      endpoint: {
        ...ep,
        id: endpointId,
        status: "PENDING_SECRET_CLAIM",
        statusLabel: "Pending claim",
      },
      claimToken: `mock_rotate_${endpointId}_${Date.now()}`,
      claimExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      secretVersion: (ep.currentSecretVersion ?? 1) + 1,
    };
  }

  const response = await apiRequest<ClaimOfferEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/webhooks/${encodeURIComponent(endpointId)}/secret-rotation-requests`,
    {
      method: "POST",
      schema: sellerWebhookClaimOfferEnvelopeSchema,
      signal,
      idempotencyKey: createIdempotencyKey(),
    },
  );
  return mapClaimOfferDto(response.data);
}

/**
 * One-time secret exchange. Raw secret returned only here — never cache.
 * claimId path segment is opaque (BE resolves by token hash); use "x" when unknown.
 */
export async function claimSellerWebhookSecret(
  storeId: string,
  endpointId: string,
  claimToken: string,
  claimId = "x",
  signal?: AbortSignal,
): Promise<WebhookSigningSecretReveal> {
  if (isMockMode()) {
    return mockWebhookSecretReveal(endpointId);
  }

  const body = sellerWebhookSecretClaimRequestSchema.parse({
    token: claimToken,
  });

  const response = await apiRequest<
    SecretClaimEnvelope,
    { token?: string; claimToken?: string }
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/webhooks/${encodeURIComponent(endpointId)}/secret-claims/${encodeURIComponent(claimId)}/exchange`,
    {
      method: "POST",
      body,
      schema: sellerWebhookSecretClaimEnvelopeSchema,
      signal,
    },
  );
  return mapSecretClaimDto(response.data);
}

/**
 * Enqueue deterministic test delivery. Server-authoritative status/latency.
 */
export async function testSellerWebhook(
  storeId: string,
  endpointId: string,
  signal?: AbortSignal,
): Promise<TestWebhookResult> {
  if (isMockMode()) {
    const deliveries = demoWebhookDeliveries(storeId);
    const failed = deliveries.find((d) => d.lastHttpStatus === 500);
    return {
      deliveryId: `whd_test_${Date.now()}`,
      endpointId,
      eventType: "webhook.test",
      eventId: `evt_test_${Date.now()}`,
      status: failed ? "DEAD_LETTER" : "DELIVERED",
      isTest: true,
      attemptCount: 1,
      lastHttpStatus: failed ? 500 : 200,
      lastLatencyMs: failed ? 1842 : 86,
      responseLabel: failed ? "500 Error" : "200 OK",
      latencyLabel: failed ? "1842 ms" : "86 ms",
      createdAt: new Date().toISOString(),
    };
  }

  const response = await apiRequest<DeliveryEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/webhooks/${encodeURIComponent(endpointId)}/test`,
    {
      method: "POST",
      schema: sellerWebhookDeliveryEnvelopeSchema,
      signal,
      idempotencyKey: createIdempotencyKey(),
    },
  );
  return mapWebhookDeliveryDto(response.data);
}

export function isWebhookNotFound(error: unknown): boolean {
  return isResourceNotFound(error);
}

export { demoWebhookDeliveries, demoWebhookEndpoints } from "./mock";
