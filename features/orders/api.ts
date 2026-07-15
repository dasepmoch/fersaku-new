import { orders } from "@/lib/mock-data";
import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope, CursorPage } from "@/shared/api/contracts";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { isLiveApi } from "@/shared/data/mode";
import type { SellerOrder } from "./contracts";

function demoOrders(): SellerOrder[] {
  return orders.map((order) => ({
    ...order,
    storeId: DEMO_STORE_ID,
    status: order.status as SellerOrder["status"],
  }));
}

export async function listSellerOrders(
  storeId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CursorPage<SellerOrder>> {
  if (!isLiveApi()) {
    return {
      items: demoOrders(),
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
    };
  }

  const response = await apiRequest<ApiEnvelope<CursorPage<SellerOrder>>>(
    `/v1/stores/${storeId}/orders`,
    { query: { cursor }, signal },
  );
  return response.data;
}

export async function getSellerOrder(
  storeId: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<SellerOrder | null> {
  if (!isLiveApi()) {
    return demoOrders().find((order) => order.id === orderId) || null;
  }

  const response = await apiRequest<ApiEnvelope<SellerOrder>>(
    `/v1/stores/${storeId}/orders/${orderId}`,
    { signal },
  );
  return response.data;
}

export { demoOrders };
