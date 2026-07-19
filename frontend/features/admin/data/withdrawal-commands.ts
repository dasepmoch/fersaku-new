/**
 * ADM-310 — typed admin withdrawal review (approve/hold/reject + disburse).
 * Prefer POST /v1/admin/withdrawals/{id}/review over generic /v1/admin/actions.
 * Permission: withdrawals.review. Money/status remain server-authoritative.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { adminWithdrawalReviewEnvelopeSchema } from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { useAppMutation } from "@/shared/query/create-mutation";
import { queryKeys } from "@/shared/query/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminWithdrawal } from "./contracts";
import {
  humanizeAdminWithdrawalStatus,
  mapAdminWithdrawalDto,
  toAdminWithdrawalReviewAction,
  type AdminWithdrawalReviewAction,
} from "./mappers";
import { appendMockAuditEvent } from "./mock-audit";
import type { WithdrawalReviewTarget } from "./withdrawals";
import { canReviewWithdrawal } from "./withdrawals";

type ReviewEnvelope = z.infer<typeof adminWithdrawalReviewEnvelopeSchema>;

export type ReviewAdminWithdrawalInput = {
  withdrawalId: string;
  /** UI target (Processing / On hold / Rejected) or wire approve|hold|reject. */
  target: WithdrawalReviewTarget | AdminWithdrawalReviewAction | string;
  reason: string;
  /** Optional gate using last known display status (server still authoritative). */
  currentStatus?: AdminWithdrawal["status"] | string;
  /** Required for approve when client last saw fee snapshot. */
  providerFeeStatus?: AdminWithdrawal["providerFeeStatus"];
  providerProcessingFee?: number | null;
  idempotencyKey?: string;
  recentMfaProof?: string;
};

export type ReviewAdminWithdrawalResult = {
  withdrawalId: string;
  /** Display status for existing AdminStatus chrome after success. */
  displayStatus: AdminWithdrawal["status"] | string;
  /** Mapped row when response is FE-shaped; otherwise null (refetch). */
  withdrawal: AdminWithdrawal | null;
  requestId: string;
  action: AdminWithdrawalReviewAction;
};

function isAdminWriteMock(): boolean {
  return shouldUseMockFixtures("adminWrite");
}

/** Whether adminWrite domain is live API (for gate helpers). */
export function isWithdrawalReviewApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

function mockDisplayStatus(
  action: AdminWithdrawalReviewAction,
): AdminWithdrawal["status"] {
  if (action === "approve") return "Processing";
  if (action === "hold") return "On hold";
  return "Rejected";
}

/**
 * POST /v1/admin/withdrawals/{withdrawalId}/review
 * BE: action approve|hold|reject + reason; approve may kick disbursement.
 * MFA: requireRecentMfa attaches session proof when present (INT-140).
 */
export async function reviewAdminWithdrawal(
  input: ReviewAdminWithdrawalInput,
  signal?: AbortSignal,
): Promise<ReviewAdminWithdrawalResult> {
  const withdrawalId = input.withdrawalId.trim();
  const reason = input.reason.trim();
  if (!withdrawalId) throw new Error("withdrawalId required");
  if (reason.length < 12) {
    throw new Error("Reason must be at least 12 characters for audit");
  }

  const action = toAdminWithdrawalReviewAction(input.target);
  if (!action) {
    throw new Error("action must be approve, hold, or reject");
  }

  if (input.currentStatus) {
    const uiTarget: WithdrawalReviewTarget =
      action === "approve"
        ? "Processing"
        : action === "hold"
          ? "On hold"
          : "Rejected";
    if (
      !canReviewWithdrawal(
        input.currentStatus as AdminWithdrawal["status"],
        uiTarget,
      )
    ) {
      throw new Error("Withdrawal transition is no longer allowed.");
    }
  }

  if (action === "approve") {
    if (
      input.providerFeeStatus !== undefined &&
      (input.providerFeeStatus !== "VERIFIED" ||
        input.providerProcessingFee === null ||
        input.providerProcessingFee === undefined)
    ) {
      throw new Error("A verified provider fee quote is required.");
    }
  }

  const idempotencyKey = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "withdrawal.review",
      target: withdrawalId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      withdrawalId,
      displayStatus: mockDisplayStatus(action),
      withdrawal: null,
      requestId: `mock_withdrawal_review_${withdrawalId}`,
      action,
    };
  }

  const response = await apiRequest<
    ReviewEnvelope,
    { action: AdminWithdrawalReviewAction; reason: string }
  >(`/v1/admin/withdrawals/${encodeURIComponent(withdrawalId)}/review`, {
    schema: adminWithdrawalReviewEnvelopeSchema,
    method: "POST",
    body: { action, reason },
    signal,
    idempotencyKey,
    auditReason: reason,
    requireRecentMfa: true,
    recentMfaProof: input.recentMfaProof,
  });

  const data = response.data;
  const displayStatus = humanizeAdminWithdrawalStatus(data.status);
  let withdrawal: AdminWithdrawal | null = null;
  if (
    typeof data.merchant === "string" &&
    typeof data.owner === "string" &&
    typeof data.amount === "number" &&
    typeof data.bank === "string" &&
    typeof data.account === "string" &&
    typeof data.risk === "string" &&
    typeof data.requested === "string" &&
    typeof data.source === "string" &&
    data.providerProcessingFee !== undefined &&
    typeof data.providerFeeStatus === "string"
  ) {
    withdrawal = mapAdminWithdrawalDto({
      id: data.id,
      merchant: data.merchant,
      owner: data.owner,
      amount: data.amount,
      bank: data.bank,
      account: data.account,
      risk: data.risk,
      status: displayStatus,
      requested: data.requested,
      source: data.source,
      providerProcessingFee: data.providerProcessingFee,
      providerFeeStatus: data.providerFeeStatus,
      ...(data.providerFeeReference
        ? { providerFeeReference: data.providerFeeReference }
        : data.providerReference
          ? { providerFeeReference: data.providerReference }
          : {}),
    });
  }

  return {
    withdrawalId: data.id || withdrawalId,
    displayStatus,
    withdrawal,
    requestId: response.meta.requestId,
    action,
  };
}

function invalidateWithdrawalCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  withdrawalId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.withdrawal(withdrawalId),
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "withdrawals"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "audit-logs"],
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.overview(),
  });
  // Seller finance may change after approve/reject (reserve/disburse).
  void queryClient.invalidateQueries({
    queryKey: ["seller"],
    predicate: (q) => {
      const key = q.queryKey;
      return (
        Array.isArray(key) &&
        (key.includes("withdrawals") ||
          key.includes("finance") ||
          key.includes("ledger") ||
          key.includes("withdrawal-lock"))
      );
    },
  });
}

export function useReviewAdminWithdrawalMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "withdrawals", "review"],
    mutationFn: (input: ReviewAdminWithdrawalInput, signal) =>
      reviewAdminWithdrawal(input, signal),
    onSuccess: (data) => {
      invalidateWithdrawalCaches(queryClient, data.withdrawalId);
    },
  });
}
