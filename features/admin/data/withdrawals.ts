import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { AdminWithdrawal } from "./contracts";
import { mockWithdrawals } from "./mock";

export function demoWithdrawals(): AdminWithdrawal[] {
  return mockWithdrawals();
}

export async function listWithdrawals(
  signal?: AbortSignal,
): Promise<AdminWithdrawal[]> {
  if (!isLiveApi()) return demoWithdrawals();

  const response = await apiRequest<ApiEnvelope<AdminWithdrawal[]>>(
    "/v1/admin/withdrawals",
    { signal },
  );
  return response.data;
}

export async function getWithdrawal(
  withdrawalId: string,
  signal?: AbortSignal,
): Promise<AdminWithdrawal | null> {
  if (!isLiveApi()) {
    return demoWithdrawals().find((w) => w.id === withdrawalId) || null;
  }

  const response = await apiRequest<ApiEnvelope<AdminWithdrawal>>(
    `/v1/admin/withdrawals/${withdrawalId}`,
    { signal },
  );
  return response.data;
}
