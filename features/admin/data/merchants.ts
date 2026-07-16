import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminMerchant } from "./contracts";
import { mockMerchants } from "./mock";

export function demoMerchants(): AdminMerchant[] {
  return mockMerchants();
}

export async function listMerchants(
  signal?: AbortSignal,
): Promise<AdminMerchant[]> {
  if (!isLiveApi()) return demoMerchants();

  const response = await apiRequest<ApiEnvelope<AdminMerchant[]>>(
    "/v1/admin/merchants",
    { signal },
  );
  return response.data;
}

export async function getMerchant(
  merchantId: string,
  signal?: AbortSignal,
): Promise<AdminMerchant | null> {
  if (!isLiveApi()) {
    return demoMerchants().find((m) => m.id === merchantId) || null;
  }

  const response = await apiRequest<ApiEnvelope<AdminMerchant>>(
    `/v1/admin/merchants/${merchantId}`,
    { signal },
  );
  return response.data;
}
