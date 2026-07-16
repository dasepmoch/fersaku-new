"use client";

import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";

export type AdminActionInput = {
  action:
    | "buyer.sessions.revoke"
    | "review.moderate"
    | "merchant.status.update"
    | "order.status.update"
    | "withdrawal.review";
  resourceId: string;
  status?: string;
  sessionId?: string;
  reason: string;
  idempotencyKey?: string;
  recentMfaProof?: string;
};

export type AdminActionResult = {
  accepted: boolean;
  action: AdminActionInput["action"];
  resourceId: string;
  requestId: string;
};

/** Source-neutral admin mutation seam; backend authorization remains authoritative. */
export async function executeAdminAction(
  input: AdminActionInput,
  signal?: AbortSignal,
): Promise<AdminActionResult> {
  if (!isLiveApi()) {
    return {
      accepted: true,
      action: input.action,
      resourceId: input.resourceId,
      requestId: `mock_${input.action}_${input.resourceId}`,
    };
  }

  const response = await apiRequest<
    ApiEnvelope<AdminActionResult>,
    AdminActionInput
  >("/v1/admin/actions", {
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
    auditReason: input.reason,
    recentMfaProof: input.recentMfaProof,
  });
  return response.data;
}

export function useAdminActionMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "action"],
    mutationFn: (input: AdminActionInput, signal) =>
      executeAdminAction(input, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}
