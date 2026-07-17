import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { AdminWithdrawal } from "./contracts";
import { mockWithdrawals } from "./mock";

export type WithdrawalReviewTarget = "Processing" | "On hold" | "Rejected";

export function canReviewWithdrawal(
  current: AdminWithdrawal["status"],
  target: WithdrawalReviewTarget,
) {
  if (current === "Pending") return true;
  if (current === "On hold") {
    return target === "Processing" || target === "Rejected";
  }
  return false;
}

export function demoWithdrawals(): AdminWithdrawal[] {
  return mockWithdrawals();
}

export async function listWithdrawals(
  signal?: AbortSignal,
): Promise<AdminWithdrawal[]> {
  if (shouldUseMockFixtures("adminRead")) return demoWithdrawals();

  const response = await apiRequest<ApiEnvelope<AdminWithdrawal[]>>(
    "/v1/admin/withdrawals",
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getWithdrawal(
  withdrawalId: string,
  signal?: AbortSignal,
): Promise<AdminWithdrawal | null> {
  if (shouldUseMockFixtures("adminRead")) {
    return demoWithdrawals().find((w) => w.id === withdrawalId) || null;
  }

  const response = await apiRequest<ApiEnvelope<AdminWithdrawal>>(
    `/v1/admin/withdrawals/${withdrawalId}`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
