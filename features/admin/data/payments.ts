import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminPaymentIntent } from "./contracts";
import { mockPayments } from "./mock";

export function demoPayments(): AdminPaymentIntent[] {
  return mockPayments();
}

export async function listPayments(
  signal?: AbortSignal,
): Promise<AdminPaymentIntent[]> {
  if (!isLiveApi()) return demoPayments();

  const response = await apiRequest<ApiEnvelope<AdminPaymentIntent[]>>(
    "/v1/admin/payments",
    { signal },
  );
  return response.data;
}
