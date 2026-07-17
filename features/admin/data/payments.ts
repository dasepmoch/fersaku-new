import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminPaymentIntent } from "./contracts";
import { mockPayments } from "./mock";

export function demoPayments(): AdminPaymentIntent[] {
  return mockPayments();
}

export async function listPayments(
  signal?: AbortSignal,
): Promise<AdminPaymentIntent[]> {
  if (shouldUseMockFixtures("adminRead")) return demoPayments();

  const response = await apiRequest<ApiEnvelope<AdminPaymentIntent[]>>(
    "/v1/admin/payments",
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
