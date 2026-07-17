import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminOrder } from "./contracts";
import { mockOrders } from "./mock";

export function demoAdminOrders(): AdminOrder[] {
  return mockOrders();
}

export async function listAdminOrders(
  signal?: AbortSignal,
): Promise<AdminOrder[]> {
  if (shouldUseMockFixtures("adminRead")) return demoAdminOrders();

  const response = await apiRequest<ApiEnvelope<AdminOrder[]>>(
    "/v1/admin/orders",
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getAdminOrder(
  orderId: string,
  signal?: AbortSignal,
): Promise<AdminOrder | null> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoAdminOrders().find((o) => o.id === orderId) || null;
  }

  const response = await apiRequest<ApiEnvelope<AdminOrder>>(
    `/v1/admin/orders/${orderId}`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
