import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { SellerRatingSummary, SellerReview } from "./contracts";
import { demoPublicReviews, demoRatingSummary, demoReviews } from "./mock";

export async function listSellerReviews(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerReview[]> {
  if (shouldUseMockFixtures("sellerOperations")) return demoReviews();

  const response = await apiRequest<ApiEnvelope<SellerReview[]>>(
    `/v1/stores/${storeId}/reviews`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function listPublicProductReviews(
  productId: string,
  signal?: AbortSignal,
): Promise<SellerReview[]> {
  if (shouldUseMockFixtures("publicCatalog")) return demoPublicReviews(productId);

  const response = await apiRequest<ApiEnvelope<SellerReview[]>>(
    `/v1/public/products/${productId}/reviews`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getPublicProductRating(
  productId: string,
  signal?: AbortSignal,
): Promise<SellerRatingSummary> {
  if (shouldUseMockFixtures("publicCatalog")) return demoRatingSummary();

  const response = await apiRequest<ApiEnvelope<SellerRatingSummary>>(
    `/v1/public/products/${productId}/reviews/summary`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export { demoRatingSummary, demoReviews } from "./mock";

export async function getSellerRatingSummary(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerRatingSummary> {
  if (shouldUseMockFixtures("sellerOperations")) return demoRatingSummary();

  const response = await apiRequest<ApiEnvelope<SellerRatingSummary>>(
    `/v1/stores/${storeId}/reviews/summary`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
