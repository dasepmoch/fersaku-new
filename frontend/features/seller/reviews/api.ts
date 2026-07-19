import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  SELLER_REVIEW_LIST_LIMIT,
  publicReviewListEnvelopeSchema,
  publicReviewSummaryEnvelopeSchema,
  reportSellerReviewRequestSchema,
  sellerReviewListEnvelopeSchema,
  sellerReviewReplyEnvelopeSchema,
  sellerReviewReportEnvelopeSchema,
  sellerStoreReviewSummaryEnvelopeSchema,
  upsertSellerReviewReplyRequestSchema,
  type ReportSellerReviewRequest,
  type UpsertSellerReviewReplyRequest,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type {
  ReportSellerReviewInput,
  SellerRatingSummary,
  SellerReview,
  UpsertSellerReplyInput,
} from "./contracts";
import {
  emptyRatingSummary,
  mapPublicReviewListDto,
  mapPublicReviewSummaryDto,
  mapSellerReviewListDto,
  mapSellerStoreReviewSummaryDto,
} from "./mappers";
import { demoPublicReviews, demoRatingSummary, demoReviews } from "./mock";

type PublicReviewListEnvelope = z.infer<typeof publicReviewListEnvelopeSchema>;
type PublicReviewSummaryEnvelope = z.infer<
  typeof publicReviewSummaryEnvelopeSchema
>;
type SellerReviewListEnvelope = z.infer<typeof sellerReviewListEnvelopeSchema>;
type SellerStoreSummaryEnvelope = z.infer<
  typeof sellerStoreReviewSummaryEnvelopeSchema
>;
type SellerReplyEnvelope = z.infer<typeof sellerReviewReplyEnvelopeSchema>;
type SellerReportEnvelope = z.infer<typeof sellerReviewReportEnvelopeSchema>;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

export function isSellerReviewsApiDomain(): boolean {
  return getDomainSource("sellerOperations") === "api";
}

/**
 * Store-scoped seller reviews. Bounded first result only (no paging control).
 * Foreign store → resource_not_found rethrow for safe 404 surface.
 */
export async function listSellerReviews(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerReview[]> {
  if (shouldUseMockFixtures("sellerOperations")) return demoReviews();

  const response = await apiRequest<SellerReviewListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/reviews`,
    {
      schema: sellerReviewListEnvelopeSchema,
      query: { limit: SELLER_REVIEW_LIST_LIMIT },
      signal,
    },
  );
  return mapSellerReviewListDto(response.data).slice(0, SELLER_REVIEW_LIST_LIMIT);
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

  const response = await apiRequest<SellerStoreSummaryEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/reviews/summary`,
    {
      schema: sellerStoreReviewSummaryEnvelopeSchema,
      signal,
    },
  );
  return mapSellerStoreReviewSummaryDto(response.data);
}

/** Create/update public seller reply; version conflict rethrows (draft kept). */
export async function upsertSellerReviewReply(
  storeId: string,
  reviewId: string,
  input: UpsertSellerReplyInput,
  signal?: AbortSignal,
): Promise<{ body: string; contentVersion: number }> {
  const body = input.body.trim();
  if (shouldUseMockFixtures("sellerOperations")) {
    return {
      body,
      contentVersion: (input.expectedVersion ?? 0) + 1,
    };
  }

  const payload: UpsertSellerReviewReplyRequest =
    upsertSellerReviewReplyRequestSchema.parse({
      body,
      expectedVersion: input.expectedVersion,
    });

  const response = await apiRequest<
    SellerReplyEnvelope,
    UpsertSellerReviewReplyRequest
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    {
      schema: sellerReviewReplyEnvelopeSchema,
      method: "PUT",
      body: payload,
      signal,
    },
  );
  return {
    body: response.data.body,
    contentVersion: response.data.contentVersion,
  };
}

/**
 * Report review to admin. Does not change moderation status.
 * Default reason OTHER when UI has no reason picker.
 */
export async function reportSellerReview(
  storeId: string,
  reviewId: string,
  input: ReportSellerReviewInput = {},
  signal?: AbortSignal,
): Promise<{ id: string; status: string }> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return { id: `report_${reviewId}`, status: "OPEN" };
  }

  const payload: ReportSellerReviewRequest =
    reportSellerReviewRequestSchema.parse({
      reasonCode: input.reasonCode ?? "OTHER",
      context: input.context,
    });

  const response = await apiRequest<
    SellerReportEnvelope,
    ReportSellerReviewRequest
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/reviews/${encodeURIComponent(reviewId)}/report`,
    {
      schema: sellerReviewReportEnvelopeSchema,
      method: "POST",
      body: payload,
      signal,
    },
  );
  return {
    id: response.data.id,
    status: response.data.status,
  };
}
