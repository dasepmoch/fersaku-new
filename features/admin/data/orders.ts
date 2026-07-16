import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminOrder } from "./contracts";
import { mockOrders } from "./mock";

export function demoAdminOrders(): AdminOrder[] {
  return mockOrders();
}

export async function listAdminOrders(
  signal?: AbortSignal,
): Promise<AdminOrder[]> {
  if (!isLiveApi()) return demoAdminOrders();

  const response = await apiRequest<ApiEnvelope<AdminOrder[]>>(
    "/v1/admin/orders",
    { signal },
  );
  return response.data;
}

export async function getAdminOrder(
  orderId: string,
  signal?: AbortSignal,
): Promise<AdminOrder | null> {
  if (!isLiveApi()) {
    return demoAdminOrders().find((o) => o.id === orderId) || null;
  }

  const response = await apiRequest<ApiEnvelope<AdminOrder>>(
    `/v1/admin/orders/${orderId}`,
    { signal },
  );
  return response.data;
}
