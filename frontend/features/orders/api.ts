import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  SELLER_ORDER_DEFAULT_PAGE_SIZE,
  sellerDeliveryResendEnvelopeSchema,
  sellerOrderDetailEnvelopeSchema,
  sellerOrderListEnvelopeSchema,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type {
  SellerOrder,
  SellerOrderListFilters,
  SellerOrderPage,
} from "./contracts";
import {
  applySellerOrderListFilters,
  mapSellerOrderDetailDto,
  mapSellerOrderListEnvelope,
  mapStatusTabToPaymentStatus,
} from "./mappers";
import { demoOrders } from "./mock";

type ListEnvelope = z.infer<typeof sellerOrderListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof sellerOrderDetailEnvelopeSchema>;
type ResendEnvelope = z.infer<typeof sellerDeliveryResendEnvelopeSchema>;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

function mockPage(
  storeId: string,
  filters?: SellerOrderListFilters,
): SellerOrderPage {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.max(
    1,
    filters?.pageSize ?? SELLER_ORDER_DEFAULT_PAGE_SIZE,
  );
  const all = applySellerOrderListFilters(
    demoOrders().map((o) => ({ ...o, storeId })),
    filters,
  );
  const totalCount = all.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: all.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    totalCount,
    pageCount,
  };
}

/**
 * Store-scoped seller order list (NumberedPageList).
 * Mock path keeps client filter/page geometry; API path uses server page meta.
 */
export async function listSellerOrders(
  storeId: string,
  filters?: SellerOrderListFilters,
  signal?: AbortSignal,
): Promise<SellerOrderPage> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return mockPage(storeId, filters);
  }

  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(
    50,
    Math.max(1, filters?.pageSize ?? SELLER_ORDER_DEFAULT_PAGE_SIZE),
  );
  const status = mapStatusTabToPaymentStatus(filters?.statusTab);
  const response = await apiRequest<ListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/orders`,
    {
      schema: sellerOrderListEnvelopeSchema,
      query: {
        page,
        pageSize,
        status: status ?? undefined,
        source: filters?.source || undefined,
        q: filters?.q?.trim() || undefined,
        from: filters?.from || undefined,
        to: filters?.to || undefined,
      },
      signal,
    },
  );
  return mapSellerOrderListEnvelope(response.data, response.meta);
}

export async function getSellerOrder(
  storeId: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<SellerOrder | null> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return (
      demoOrders().find(
        (order) => order.id === orderId || order.internalOrderId === orderId,
      ) || null
    );
  }

  try {
    const response = await apiRequest<DetailEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
      {
        schema: sellerOrderDetailEnvelopeSchema,
        signal,
      },
    );
    return mapSellerOrderDetailDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Existing UI control: resend delivery email only.
 * Retry/revoke remain out-of-scope (no buttons).
 */
export async function resendSellerOrderDelivery(
  storeId: string,
  orderId: string,
  options?: { idempotencyKey?: string; reason?: string; signal?: AbortSignal },
): Promise<{ queued: boolean; status?: string }> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return { queued: true, status: "ACTIVE" };
  }
  const response = await apiRequest<
    ResendEnvelope,
    { reason?: string }
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/delivery/resend`,
    {
      schema: sellerDeliveryResendEnvelopeSchema,
      method: "POST",
      body: options?.reason ? { reason: options.reason } : {},
      signal: options?.signal,
      idempotencyKey: options?.idempotencyKey ?? createIdempotencyKey(),
    },
  );
  return {
    queued: response.data.queued ?? true,
    status: response.data.status,
  };
}
