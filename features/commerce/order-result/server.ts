/**
 * CHK-130 — private/public SSR order result (cookie forward + no-store).
 * Server Components only; do not import from Client Components.
 *
 * Capability: session cookie when authenticated owner; guest relies on
 * purpose-bound capability exchange (header) when available — never query.
 */

import "server-only";

import { serverApiRequest } from "@/shared/api/server-http-client";
import { rethrowForServerComponent } from "@/shared/api/server-http-client";
import { ApiError } from "@/shared/api/api-error";
import { classifyApiError } from "@/shared/api/error-policy";
import { orderResultEnvelopeSchema } from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import {
  ORDER_CAPABILITY_HEADER,
  type OrderResult,
} from "./contracts";
import { buildMockOrderResult, mapOrderResultDto } from "./mappers";

export type GetOrderResultServerOptions = {
  /**
   * Purpose-bound guest capability (already scrubbed from fragment).
   * Never logged; sent only as header when present.
   */
  capability?: string;
  /**
   * Explicit payment status for mock fixtures only (tests).
   * Never used as live authority.
   */
  mockPaymentStatus?: string;
};

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

/**
 * SSR order result: session cookie + no-store.
 * RESOURCE_NOT_FOUND → Next notFound(); 401/403 rethrow for guards.
 * Foreign/invalid capability must not enumerate existence.
 */
export async function getOrderResultServer(
  orderId: string,
  options?: GetOrderResultServerOptions,
): Promise<OrderResult> {
  const id = orderId.trim();
  if (!id) {
    const { notFound } = await import("next/navigation");
    notFound();
  }

  if (shouldUseMockFixtures("checkout")) {
    return buildMockOrderResult({
      orderId: id,
      paymentStatus: options?.mockPaymentStatus ?? "PAID",
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

    const response = await serverApiRequest<
      { data: Parameters<typeof mapOrderResultDto>[0] },
      never
    >(`/v1/orders/${encodeURIComponent(id)}`, {
      schema: orderResultEnvelopeSchema,
      method: "GET",
      privacy: "private",
      headers,
    });
    return mapOrderResultDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    rethrowForServerComponent(error);
  }
}
