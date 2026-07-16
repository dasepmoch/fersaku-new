import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { SellerRatingSummary, SellerReview } from "./contracts";
import { demoPublicReviews, demoRatingSummary, demoReviews } from "./mock";

export async function listSellerReviews(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerReview[]> {
  if (!isLiveApi()) return demoReviews();

  const response = await apiRequest<ApiEnvelope<SellerReview[]>>(
    `/v1/stores/${storeId}/reviews`,
    { signal },
  );
  return response.data;
}

export async function listPublicProductReviews(
  productId: string,
  signal?: AbortSignal,
): Promise<SellerReview[]> {
  if (!isLiveApi()) return demoPublicReviews(productId);

  const response = await apiRequest<ApiEnvelope<SellerReview[]>>(
    `/v1/public/products/${productId}/reviews`,
    { signal },
  );
  return response.data;
}

export async function getPublicProductRating(
  productId: string,
  signal?: AbortSignal,
): Promise<SellerRatingSummary> {
  if (!isLiveApi()) return demoRatingSummary();

  const response = await apiRequest<ApiEnvelope<SellerRatingSummary>>(
    `/v1/public/products/${productId}/reviews/summary`,
    { signal },
  );
  return response.data;
}

export { demoRatingSummary, demoReviews } from "./mock";

export async function getSellerRatingSummary(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerRatingSummary> {
  if (!isLiveApi()) return demoRatingSummary();

  const response = await apiRequest<ApiEnvelope<SellerRatingSummary>>(
    `/v1/stores/${storeId}/reviews/summary`,
    { signal },
  );
  return response.data;
}
