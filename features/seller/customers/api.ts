import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { SellerCustomer } from "./contracts";
import { demoCustomers } from "./mock";

export async function listSellerCustomers(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerCustomer[]> {
  if (!isLiveApi()) return demoCustomers();

  const response = await apiRequest<ApiEnvelope<SellerCustomer[]>>(
    `/v1/stores/${storeId}/customers`,
    { signal },
  );
  return response.data;
}

export async function getSellerCustomer(
  storeId: string,
  customerId: string,
  signal?: AbortSignal,
): Promise<SellerCustomer | null> {
  if (!isLiveApi()) {
    return demoCustomers().find((c) => c.id === customerId) || null;
  }

  const response = await apiRequest<ApiEnvelope<SellerCustomer>>(
    `/v1/stores/${storeId}/customers/${customerId}`,
    { signal },
  );
  return response.data;
}
