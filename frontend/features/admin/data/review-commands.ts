/**
 * ADM-330 — typed admin review moderation (hide/restore/publish/remove).
 * Prefer POST /v1/admin/reviews/{id}/transition over generic /v1/admin/actions.
 * Permissions: reviews.moderate (mutation); list remains reviews.read.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { adminReviewModerateEnvelopeSchema } from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { useAppMutation } from "@/shared/query/create-mutation";
import { queryKeys } from "@/shared/query/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  humanizeAdminReviewStatus,
  toAdminReviewStatusWire,
  type AdminReviewStatusWire,
} from "./mappers";
import { appendMockAuditEvent } from "./mock-audit";

type ModerateEnvelope = z.infer<typeof adminReviewModerateEnvelopeSchema>;

export type ModerateAdminReviewInput = {
  reviewId: string;
  /** UI label (Published / Needs edit / Removed / Pending moderation) or wire enum. */
  status: string;
  reason: string;
  productId?: string;
  idempotencyKey?: string;
};

export type ModerateAdminReviewResult = {
  reviewId: string;
  /** Display status for existing AdminStatus chrome after success. */
  displayStatus: string;
  productId?: string;
  requestId: string;
};

function isAdminWriteMock(): boolean {
  return shouldUseMockFixtures("adminWrite");
}

/** Whether adminWrite domain is live API (for gate helpers). */
export function isReviewModerateApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

/**
 * POST /v1/admin/reviews/{reviewId}/transition
 * BE: reviews.moderate + reason; status PUBLISHED|NEEDS_EDIT|REMOVED|PENDING.
 */
export async function moderateAdminReview(
  input: ModerateAdminReviewInput,
  signal?: AbortSignal,
): Promise<ModerateAdminReviewResult> {
  const reviewId = input.reviewId.trim();
  const reason = input.reason.trim();
  if (!reviewId) throw new Error("reviewId required");
  if (reason.length < 12) {
    throw new Error("Reason must be at least 12 characters for audit");
  }

  const wire = toAdminReviewStatusWire(input.status);
  if (!wire) {
    throw new Error(
      "status must be PUBLISHED, NEEDS_EDIT, REMOVED, or PENDING",
    );
  }

  const idempotencyKey = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "review.moderate",
      target: reviewId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      reviewId,
      displayStatus: humanizeAdminReviewStatus(wire),
      ...(input.productId ? { productId: input.productId } : {}),
      requestId: `mock_review_moderate_${reviewId}`,
    };
  }

  const response = await apiRequest<
    ModerateEnvelope,
    { status: AdminReviewStatusWire; reason: string }
  >(`/v1/admin/reviews/${encodeURIComponent(reviewId)}/transition`, {
    schema: adminReviewModerateEnvelopeSchema,
    method: "POST",
    body: { status: wire, reason },
    signal,
    idempotencyKey,
    auditReason: reason,
  });

  return {
    reviewId: response.data.id,
    displayStatus: humanizeAdminReviewStatus(response.data.status),
    ...(response.data.productId
      ? { productId: response.data.productId }
      : input.productId
        ? { productId: input.productId }
        : {}),
    requestId: response.meta.requestId,
  };
}

function invalidateReviewCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  productId?: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["admin", "reviews"],
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.reviews(),
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "audit-logs"],
  });
  if (productId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.public.productReviews(productId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.public.productReviewSummary(productId),
    });
  }
  void queryClient.invalidateQueries({
    queryKey: ["seller"],
    predicate: (q) => {
      const key = q.queryKey;
      return Array.isArray(key) && key.includes("reviews");
    },
  });
}

export function useModerateAdminReviewMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "reviews", "moderate"],
    mutationFn: (input: ModerateAdminReviewInput, signal) =>
      moderateAdminReview(input, signal),
    onSuccess: (data) => {
      invalidateReviewCaches(queryClient, data.productId);
    },
  });
}
