import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  BUYER_PURCHASE_LIST_LIMIT,
  buyerCreateReviewRequestSchema,
  buyerPatchReviewRequestSchema,
  buyerPurchaseDetailEnvelopeSchema,
  buyerPurchaseListEnvelopeSchema,
  buyerReviewEnvelopeSchema,
  structuralEnvelopeSchema,
  type BuyerCreateReviewRequest,
  type BuyerPatchReviewRequest,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type {
  BuyerProfile,
  BuyerPurchase,
  BuyerPurchaseListFilters,
  BuyerReview,
  BuyerSession,
  CreateBuyerReviewInput,
  PatchBuyerReviewInput,
} from "./contracts";
import {
  mapBuyerPurchaseDetailDto,
  mapBuyerPurchaseSummaryListDto,
  mapBuyerReviewDto,
} from "./mappers";
import { demoProfile, demoPurchases, demoSessions } from "./mock";

type PurchaseListEnvelope = z.infer<typeof buyerPurchaseListEnvelopeSchema>;
type PurchaseDetailEnvelope = z.infer<typeof buyerPurchaseDetailEnvelopeSchema>;
type BuyerReviewEnvelope = z.infer<typeof buyerReviewEnvelopeSchema>;

export type RevokeBuyerSessionInput = {
  sessionId: string;
  reason?: string;
  idempotencyKey?: string;
};

export type RevokeBuyerSessionResult = {
  accepted: boolean;
  sessionId: string;
  requestId: string;
};

/** Launch BoundedNoPaging: first page only; no cursor UI (UI-080 for expansion). */
export const BUYER_PURCHASE_BOUNDED_LIMIT = BUYER_PURCHASE_LIST_LIMIT;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

function matchesClientFilter(
  p: BuyerPurchase,
  filters?: BuyerPurchaseListFilters,
): boolean {
  if (!filters) return true;
  const filter = filters.filter ?? "Semua";
  const q = (filters.q ?? "").trim().toLowerCase();
  const typeOk =
    filter === "Semua" ||
    (filter === "Update tersedia" && Boolean(p.updateAvailable)) ||
    (filter === "File" && p.deliveryType === "download") ||
    (filter === "Akses & kode" && p.deliveryType !== "download");
  if (!typeOk) return false;
  if (!q) return true;
  return (
    p.product.toLowerCase().includes(q) ||
    p.seller.toLowerCase().includes(q) ||
    p.orderId.toLowerCase().includes(q)
  );
}

export async function revokeBuyerSession(
  input: RevokeBuyerSessionInput,
  signal?: AbortSignal,
): Promise<RevokeBuyerSessionResult> {
  if (shouldUseMockFixtures("buyer")) {
    return {
      accepted: true,
      sessionId: input.sessionId,
      requestId: `mock_revoke_${input.sessionId}`,
    };
  }
  const response = await apiRequest<
    ApiEnvelope<RevokeBuyerSessionResult>,
    RevokeBuyerSessionInput
  >(`/v1/buyer/sessions/${input.sessionId}/revoke`, {
    schema: structuralEnvelopeSchema,
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
    auditReason: input.reason,
  });
  return response.data;
}

/**
 * Browser list adapter. Session-scoped by cookie; bounded first page only.
 * Client filter/search mirrors existing PurchaseLibrary controls (no BE search).
 */
export async function listBuyerPurchases(
  signal?: AbortSignal,
  filters?: BuyerPurchaseListFilters,
): Promise<BuyerPurchase[]> {
  if (shouldUseMockFixtures("buyer")) {
    return demoPurchases().filter((p) => matchesClientFilter(p, filters));
  }

  const response = await apiRequest<PurchaseListEnvelope>(
    "/v1/buyer/purchases",
    {
      schema: buyerPurchaseListEnvelopeSchema,
      query: { limit: BUYER_PURCHASE_BOUNDED_LIMIT },
      signal,
    },
  );
  const mapped = mapBuyerPurchaseSummaryListDto(response.data);
  return mapped.filter((p) => matchesClientFilter(p, filters));
}

/**
 * Browser detail adapter. Cross-buyer / missing → null (safe 404).
 * 401 rethrows for auth flow; other errors rethrow (no mock fallback).
 */
export async function getBuyerPurchase(
  orderId: string,
  signal?: AbortSignal,
): Promise<BuyerPurchase | null> {
  if (shouldUseMockFixtures("buyer")) {
    return demoPurchases().find((p) => p.orderId === orderId) || null;
  }

  try {
    // Canonical detail path includes trailing slash (router mounts GET /).
    const response = await apiRequest<PurchaseDetailEnvelope>(
      `/v1/buyer/purchases/${encodeURIComponent(orderId)}/`,
      {
        schema: buyerPurchaseDetailEnvelopeSchema,
        signal,
      },
    );
    return mapBuyerPurchaseDetailDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

export async function getBuyerProfile(
  signal?: AbortSignal,
): Promise<BuyerProfile> {
  if (shouldUseMockFixtures("buyer")) return demoProfile();

  const response = await apiRequest<ApiEnvelope<BuyerProfile>>(
    "/v1/buyer/profile",
    {
      schema: structuralEnvelopeSchema,
      signal,
    },
  );
  return response.data;
}

export async function listBuyerSessions(
  signal?: AbortSignal,
): Promise<BuyerSession[]> {
  if (shouldUseMockFixtures("buyer")) return demoSessions();

  const response = await apiRequest<ApiEnvelope<BuyerSession[]>>(
    "/v1/buyer/sessions",
    {
      schema: structuralEnvelopeSchema,
      signal,
    },
  );
  return response.data;
}

/** Domain gate: buyer review mutations only when buyer domain is api. */
export function isBuyerReviewApiDomain(): boolean {
  return getDomainSource("buyer") === "api";
}

function mockBuyerReview(
  input: CreateBuyerReviewInput | (PatchBuyerReviewInput & { orderItemId?: string }),
  existing?: BuyerReview,
): BuyerReview {
  if ("reviewId" in input) {
    return {
      id: input.reviewId,
      orderItemId: existing?.orderItemId,
      productId: existing?.productId ?? "",
      rating: input.rating ?? existing?.rating ?? 5,
      title: input.title ?? existing?.title ?? "",
      body: input.body ?? existing?.body ?? "",
      status: existing?.status ?? "PUBLISHED",
      verifiedPurchase: existing?.verifiedPurchase ?? true,
      contentVersion: (existing?.contentVersion ?? input.expectedVersion) + 1,
    };
  }
  return {
    id: `rev_mock_${input.orderItemId}`,
    orderItemId: input.orderItemId,
    productId: input.productId ?? "",
    rating: input.rating,
    title: input.title ?? "",
    body: input.body ?? "",
    status: "PUBLISHED",
    verifiedPurchase: true,
    contentVersion: 1,
  };
}

/**
 * Create verified purchase review.
 * POST /v1/buyer/reviews — eligibility/ownership server-authoritative.
 * Does not invent status; maps server ReviewView only.
 */
export async function createBuyerReview(
  input: CreateBuyerReviewInput,
  signal?: AbortSignal,
): Promise<BuyerReview> {
  const orderItemId = input.orderItemId.trim();
  if (!orderItemId) {
    throw new Error("orderItemId required");
  }
  const rating = Math.trunc(input.rating);
  if (rating < 1 || rating > 5) {
    throw new Error("rating must be 1..5");
  }

  if (shouldUseMockFixtures("buyer")) {
    return mockBuyerReview({ ...input, orderItemId, rating });
  }

  const body: BuyerCreateReviewRequest = buyerCreateReviewRequestSchema.parse({
    orderItemId,
    rating,
    title: input.title,
    body: input.body,
    productId: input.productId,
    storeId: input.storeId,
  });

  const response = await apiRequest<BuyerReviewEnvelope, BuyerCreateReviewRequest>(
    "/v1/buyer/reviews",
    {
      schema: buyerReviewEnvelopeSchema,
      method: "POST",
      body,
      signal,
    },
  );
  return mapBuyerReviewDto(response.data);
}

/**
 * Patch own review content (versioned).
 * PATCH /v1/buyer/reviews/{reviewId}
 * 409 version conflict rethrows — caller keeps typed text and refetches.
 * Non-owner → resource_not_found (safe).
 */
export async function patchBuyerReview(
  input: PatchBuyerReviewInput,
  signal?: AbortSignal,
): Promise<BuyerReview> {
  const reviewId = input.reviewId.trim();
  if (!reviewId) {
    throw new Error("reviewId required");
  }
  if (input.expectedVersion < 1) {
    throw new Error("expectedVersion required");
  }

  if (shouldUseMockFixtures("buyer")) {
    return mockBuyerReview(input);
  }

  const body: BuyerPatchReviewRequest = buyerPatchReviewRequestSchema.parse({
    expectedVersion: input.expectedVersion,
    rating: input.rating,
    title: input.title,
    body: input.body,
  });

  const response = await apiRequest<BuyerReviewEnvelope, BuyerPatchReviewRequest>(
    `/v1/buyer/reviews/${encodeURIComponent(reviewId)}`,
    {
      schema: buyerReviewEnvelopeSchema,
      method: "PATCH",
      body,
      signal,
    },
  );
  return mapBuyerReviewDto(response.data);
}
