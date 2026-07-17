import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminReview } from "./contracts";
import { mockReviews } from "./mock";

export function demoAdminReviews(): AdminReview[] {
  return mockReviews();
}

export async function listAdminReviews(
  signal?: AbortSignal,
): Promise<AdminReview[]> {
  if (shouldUseMockFixtures("adminRead")) return demoAdminReviews();
  const response = await apiRequest<ApiEnvelope<AdminReview[]>>(
    "/v1/admin/reviews",
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
