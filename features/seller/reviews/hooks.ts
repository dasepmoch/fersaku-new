"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import {
  demoRatingSummary,
  demoReviews,
  getSellerRatingSummary,
  listSellerReviews,
} from "./api";

export function useSellerReviews(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.reviews(storeId),
    queryFn: (signal) => listSellerReviews(storeId, signal),
    placeholderData: mockPlaceholderData("sellerOperations", demoReviews()),
  });
}

export function useSellerRatingSummary(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.reviewsSummary(storeId),
    queryFn: (signal) => getSellerRatingSummary(storeId, signal),
    placeholderData: mockPlaceholderData("sellerOperations", demoRatingSummary()),
  });
}
