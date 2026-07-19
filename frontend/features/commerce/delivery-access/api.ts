/**
 * CHK-140 — delivery access / resend adapters.
 * Secrets only via POST access; mock path returns fixtures without network.
 */

import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  deliveryAccessEnvelopeSchema,
  deliveryResendEnvelopeSchema,
  type DeliveryAccessDto,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type { DeliveryAccessClaim, DeliveryResendResult } from "./contracts";
import { mapDeliveryAccessDto, mapDeliveryResendDto } from "./mappers";

export type AccessBuyerDeliveryOptions = {
  signal?: AbortSignal;
};

export type AccessOrderDeliveryOptions = {
  signal?: AbortSignal;
  /**
   * Guest purpose-bound access token (POST body only — never query/path/storage).
   * Prefer session ownership when cookie present (BE falls through).
   */
  token?: string;
};

export type ResendBuyerDeliveryInput = {
  orderId: string;
  reason?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

function isAccessDenied(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 403) return true;
  const code = error.problem?.code ?? "";
  return (
    code === "DELIVERY_ACCESS_DENIED" ||
    code === "DELIVERY_REVOKED" ||
    code === "DELIVERY_EXPIRED" ||
    code === "FORBIDDEN"
  );
}

/** Domain gate: buyer purchase delivery uses buyer domain. */
export function isBuyerDeliveryApiDomain(): boolean {
  return getDomainSource("buyer") === "api";
}

/** Domain gate: order-result delivery uses checkout domain. */
export function isOrderDeliveryApiDomain(): boolean {
  return getDomainSource("checkout") === "api";
}

function buildMockAccess(orderId: string): DeliveryAccessClaim {
  const id = orderId.trim() || "mock-order";
  return mapDeliveryAccessDto({
    grantId: `grant_mock_${id}`,
    orderId: id,
    orderItemId: `oi_mock_${id}`,
    deliveryKind: "CODE",
    status: "ACTIVE",
    accessCount: 1,
    maxAccesses: 5,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    secrets: {
      code: "MOCK-CODE-NOT-REAL",
      username: "demo_user",
      password: "demo_pass_not_real",
    },
  });
}

function buildMockDownloadAccess(orderId: string): DeliveryAccessClaim {
  const id = orderId.trim() || "mock-order";
  return mapDeliveryAccessDto({
    grantId: `grant_mock_${id}`,
    orderId: id,
    orderItemId: `oi_mock_${id}`,
    deliveryKind: "DOWNLOAD",
    status: "ACTIVE",
    accessCount: 1,
    maxAccesses: 5,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    downloadObjectId: `obj_mock_${id}`,
  });
}

/**
 * Buyer session access: POST /v1/buyer/purchases/{orderId}/delivery/access
 * Owner only; foreign → null (safe 404). Access denied/revoked/expired rethrows.
 */
export async function accessBuyerDelivery(
  orderId: string,
  options?: AccessBuyerDeliveryOptions,
): Promise<DeliveryAccessClaim | null> {
  const id = orderId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("buyer")) {
    return buildMockAccess(id);
  }

  try {
    const response = await apiRequest<{ data: DeliveryAccessDto }>(
      `/v1/buyer/purchases/${encodeURIComponent(id)}/delivery/access`,
      {
        schema: deliveryAccessEnvelopeSchema,
        method: "POST",
        signal: options?.signal,
      },
    );
    return mapDeliveryAccessDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Order-scoped access (owner session and/or guest token body).
 * POST /v1/orders/{orderId}/delivery/access
 * Foreign/invalid token → null when 404; 403 access denied rethrows.
 */
export async function accessOrderDelivery(
  orderId: string,
  options?: AccessOrderDeliveryOptions,
): Promise<DeliveryAccessClaim | null> {
  const id = orderId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("checkout")) {
    return buildMockDownloadAccess(id);
  }

  const token = options?.token?.trim();
  try {
    const response = await apiRequest<
      { data: DeliveryAccessDto },
      { token?: string }
    >(`/v1/orders/${encodeURIComponent(id)}/delivery/access`, {
      schema: deliveryAccessEnvelopeSchema,
      method: "POST",
      body: token ? { token } : {},
      signal: options?.signal,
    });
    return mapDeliveryAccessDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    if (isAccessDenied(error)) return null;
    throw error;
  }
}

/**
 * Buyer resend: POST /v1/buyer/purchases/{orderId}/delivery/resend
 * Idempotent; never returns secrets.
 */
export async function resendBuyerDelivery(
  input: ResendBuyerDeliveryInput,
): Promise<DeliveryResendResult> {
  const id = input.orderId.trim();
  if (!id) {
    throw new Error("orderId required");
  }

  if (shouldUseMockFixtures("buyer")) {
    return {
      grantId: `grant_mock_${id}`,
      orderId: id,
      status: "ACTIVE",
      queued: true,
    };
  }

  const response = await apiRequest<
    {
      data: {
        grantId?: string;
        orderId?: string;
        status?: string;
        queued?: boolean;
      };
    },
    { idempotencyKey?: string; reason?: string }
  >(`/v1/buyer/purchases/${encodeURIComponent(id)}/delivery/resend`, {
    schema: deliveryResendEnvelopeSchema,
    method: "POST",
    body: {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    },
    signal: input.signal,
    idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
  });
  return mapDeliveryResendDto(response.data);
}

/** Mock helpers for tests / download-kind fixture. */
export function buildMockDeliveryAccess(
  kind: "CODE" | "DOWNLOAD" | "CREDENTIAL" | "PROTECTED_LINK",
  orderId = "01HQ0ORDER000000000000001",
): DeliveryAccessClaim {
  if (kind === "DOWNLOAD" || kind === "PROTECTED_LINK") {
    const claim = buildMockDownloadAccess(orderId);
    return {
      ...claim,
      deliveryKind: kind,
    };
  }
  const claim = buildMockAccess(orderId);
  return {
    ...claim,
    deliveryKind: kind,
  };
}
