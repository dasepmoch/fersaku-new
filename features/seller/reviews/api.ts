import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  publicReviewListEnvelopeSchema,
  publicReviewSummaryEnvelopeSchema,
  structuralEnvelopeSchema,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { classifyApiError } from "@/shared/api/error-policy";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { SellerRatingSummary, SellerReview } from "./contracts";
import {
  emptyRatingSummary,
  mapPublicReviewListDto,
  mapPublicReviewSummaryDto,
} from "./mappers";
import { demoPublicReviews, demoRatingSummary, demoReviews } from "./mock";

type PublicReviewListEnvelope = z.infer<typeof publicReviewListEnvelopeSchema>;
type PublicReviewSummaryEnvelope = z.infer<
  typeof publicReviewSummaryEnvelopeSchema
>;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

export async function listSellerReviews(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerReview[]> {
  if (shouldUseMockFixtures("sellerOperations")) return demoReviews();

  const response = await apiRequest<ApiEnvelope<SellerReview[]>>(
    `/v1/stores/${storeId}/reviews`,
    {
      schema: structuralEnvelopeSchema,
      signal,
    },
  );
  return response.data;
}

/**
 * Published product reviews. 404 → []; network/5xx rethrow.
 * Layout has no pagination control — first page only (cursor not exposed).
 */
export async function listPublicProductReviews(
  productId: string,
  signal?: AbortSignal,
): Promise<SellerReview[]> {
  if (shouldUseMockFixtures("publicCatalog")) return demoPublicReviews(productId);

  try {
    const response = await apiRequest<PublicReviewListEnvelope>(
      `/v1/public/products/${encodeURIComponent(productId)}/reviews`,
      {
        schema: publicReviewListEnvelopeSchema,
        signal,
      },
    );
    return mapPublicReviewListDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return [];
    throw error;
  }
}

/**
 * Rating summary. Zero-review → total=0, distribution zeros (no NaN).
 * 404 → empty summary; network/5xx rethrow.
 */
export async function getPublicProductRating(
  productId: string,
  signal?: AbortSignal,
): Promise<SellerRatingSummary> {
  if (shouldUseMockFixtures("publicCatalog")) return demoRatingSummary();

  try {
    const response = await apiRequest<PublicReviewSummaryEnvelope>(
      `/v1/public/products/${encodeURIComponent(productId)}/reviews/summary`,
      {
        schema: publicReviewSummaryEnvelopeSchema,
        signal,
      },
    );
    return mapPublicReviewSummaryDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return emptyRatingSummary();
    throw error;
  }
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
      schema: structuralEnvelopeSchema,
      signal,
    },
  );
  return response.data;
}
