import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminMerchant } from "./contracts";
import { mockMerchants } from "./mock";

export function demoMerchants(): AdminMerchant[] {
  return mockMerchants();
}

export async function listMerchants(
  signal?: AbortSignal,
): Promise<AdminMerchant[]> {
  if (shouldUseMockFixtures("adminRead")) return demoMerchants();

  const response = await apiRequest<ApiEnvelope<AdminMerchant[]>>(
    "/v1/admin/merchants",
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getMerchant(
  merchantId: string,
  signal?: AbortSignal,
): Promise<AdminMerchant | null> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoMerchants().find((m) => m.id === merchantId) || null;
  }

  const response = await apiRequest<ApiEnvelope<AdminMerchant>>(
    `/v1/admin/merchants/${merchantId}`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
