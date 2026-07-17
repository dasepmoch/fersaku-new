import { apiRequest } from "@/shared/api/http-client";
import {
  structuralEnvelopeSchema,
  structuralCursorPageEnvelopeSchema,
} from "@/shared/api/schemas";
import type { ApiEnvelope, CursorPage } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { SellerOrder } from "./contracts";
import { demoOrders } from "./mock";

export async function listSellerOrders(
  storeId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CursorPage<SellerOrder>> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return {
      items: demoOrders(),
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
    };
  }

  const response = await apiRequest<ApiEnvelope<CursorPage<SellerOrder>>>(
    `/v1/stores/${storeId}/orders`,
    {
    schema: structuralCursorPageEnvelopeSchema, query: { cursor }, signal },
  );
  return response.data;
}

export async function getSellerOrder(
  storeId: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<SellerOrder | null> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return demoOrders().find((order) => order.id === orderId) || null;
  }

  const response = await apiRequest<ApiEnvelope<SellerOrder>>(
    `/v1/stores/${storeId}/orders/${orderId}`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
