import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminReview } from "./contracts";
import { mockReviews } from "./mock";

export function demoAdminReviews(): AdminReview[] {
  return mockReviews();
}

export async function listAdminReviews(
  signal?: AbortSignal,
): Promise<AdminReview[]> {
  if (!isLiveApi()) return demoAdminReviews();
  const response = await apiRequest<ApiEnvelope<AdminReview[]>>(
    "/v1/admin/reviews",
    { signal },
  );
  return response.data;
}
