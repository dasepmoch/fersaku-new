import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { SellerCustomer } from "./contracts";
import { demoCustomers } from "./mock";

export async function listSellerCustomers(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerCustomer[]> {
  if (shouldUseMockFixtures("sellerOperations")) return demoCustomers();

  const response = await apiRequest<ApiEnvelope<SellerCustomer[]>>(
    `/v1/stores/${storeId}/customers`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getSellerCustomer(
  storeId: string,
  customerId: string,
  signal?: AbortSignal,
): Promise<SellerCustomer | null> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return demoCustomers().find((c) => c.id === customerId) || null;
  }

  const response = await apiRequest<ApiEnvelope<SellerCustomer>>(
    `/v1/stores/${storeId}/customers/${customerId}`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
