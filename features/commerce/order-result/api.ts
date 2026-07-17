/**
 * CHK-130 — browser order-result adapter (capability-safe).
 * GET /v1/orders/{orderId}; session cookies when present.
 * Optional capability only via header (never query/path/storage).
 */

import { apiRequest, ApiError } from "@/shared/api/http-client";
import { orderResultEnvelopeSchema } from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import {
  ORDER_CAPABILITY_HEADER,
  type OrderResult,
  type OrderResultDisplayState,
} from "./contracts";
import { buildMockOrderResult, mapOrderResultDto } from "./mappers";

export { ORDER_CAPABILITY_HEADER };

export type GetOrderResultOptions = {
  signal?: AbortSignal;
  /**
   * Purpose-bound guest capability held in memory only.
   * Sent as X-Order-Capability; never query/path/storage.
   */
  capability?: string;
};

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

/**
 * Fetch canonical order result. Returns null for safe not-found (foreign/invalid).
 * 401 rethrows for auth flows; other errors rethrow (no mock fallback in api mode).
 */
export async function getOrderResult(
  orderId: string,
  options?: GetOrderResultOptions,
): Promise<OrderResult | null> {
  const id = orderId.trim();
  if (!id) return null;

  if (shouldUseMockFixtures("checkout")) {
    // Mock: deterministic fixture; path status never applied here.
    return buildMockOrderResult({
      orderId: id,
      paymentStatus: "PAID",
      productTitle: "AI Prompt Pack",
      productSlug: "ai-prompt-pack",
      storeSlug: "asep-ai-tools",
    });
  }

  try {
    const headers: Record<string, string> = {};
    const cap = options?.capability?.trim();
    if (cap) {
      headers[ORDER_CAPABILITY_HEADER] = cap;
    }

    const response = await apiRequest<{
      data: Parameters<typeof mapOrderResultDto>[0];
    }>(`/v1/orders/${encodeURIComponent(id)}`, {
      schema: orderResultEnvelopeSchema,
      method: "GET",
      signal: options?.signal,
      headers,
    });
    return mapOrderResultDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/** True when checkout domain is live API (order result uses same domain). */
export function isOrderResultApiDomain(): boolean {
  return getDomainSource("checkout") === "api";
}

/**
 * Resolve display state for page chrome from backend result only.
 * URL status is ignored as authority (may only be used for presentational redirect).
 */
export function resolveOrderResultDisplayState(
  result: OrderResult,
  _urlStatus?: string,
): OrderResultDisplayState {
  void _urlStatus;
  return result.displayState;
}
