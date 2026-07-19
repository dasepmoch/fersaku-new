"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  demoRatingSummary,
  demoReviews,
  getSellerRatingSummary,
  listSellerReviews,
  reportSellerReview,
  upsertSellerReviewReply,
} from "./api";
import type {
  ReportSellerReviewInput,
  UpsertSellerReplyInput,
} from "./contracts";

export function useSellerReviews(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.reviews(storeId),
    queryFn: (signal) => listSellerReviews(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerOperations", demoReviews()),
  });
}

export function useSellerRatingSummary(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.reviewsSummary(storeId),
    queryFn: (signal) => getSellerRatingSummary(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoRatingSummary(),
    ),
  });
}

function invalidateSellerReviews(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
  productId?: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.reviews(storeId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.reviewsSummary(storeId),
  });
  if (productId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.public.productReviews(productId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.public.productReviewSummary(productId),
    });
  }
}

/** Existing reply control — local draft until success; no optimistic publish. */
export function useUpsertSellerReviewReply(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "reviews", "reply"],
    mutationFn: async (
      variables: UpsertSellerReplyInput & {
        reviewId: string;
        productId?: string;
      },
      signal,
    ) =>
      upsertSellerReviewReply(
        storeId,
        variables.reviewId,
        {
          body: variables.body,
          expectedVersion: variables.expectedVersion,
        },
        signal,
      ),
    onSuccess: async (_data, variables) => {
      invalidateSellerReviews(queryClient, storeId, variables.productId);
    },
  });
}

/** Existing report control — pending/failure not success; list stays until refetch. */
export function useReportSellerReview(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "reviews", "report"],
    mutationFn: async (
      variables: ReportSellerReviewInput & {
        reviewId: string;
        productId?: string;
      },
      signal,
    ) =>
      reportSellerReview(
        storeId,
        variables.reviewId,
        {
          reasonCode: variables.reasonCode,
          context: variables.context,
        },
        signal,
      ),
    onSuccess: async (_data, variables) => {
      invalidateSellerReviews(queryClient, storeId, variables.productId);
    },
  });
}
