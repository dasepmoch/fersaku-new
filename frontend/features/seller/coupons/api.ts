import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  couponCreateRequestSchema,
  couponEnvelopeSchema,
  couponListEnvelopeSchema,
  couponPatchRequestSchema,
  type CouponCreateRequest,
  type CouponPatchRequest,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  CreateSellerCouponInput,
  PatchSellerCouponInput,
  SellerCoupon,
} from "./contracts";
import {
  mapCouponDto,
  mapCouponListDto,
  toCreateCouponRequestBody,
  toPatchCouponRequestBody,
} from "./mappers";
import { demoCoupons } from "./mock";

type ListEnvelope = z.infer<typeof couponListEnvelopeSchema>;
type CouponEnvelope = z.infer<typeof couponEnvelopeSchema>;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

export function isSellerCouponsApiDomain(): boolean {
  return getDomainSource("sellerOperations") === "api";
}

/**
 * Store-scoped coupon list. Foreign store → resource_not_found rethrow (safe 404).
 * BE returns full array; client TablePagination pages the result (snapshot geometry).
 */
export async function listSellerCoupons(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerCoupon[]> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return demoCoupons(storeId);
  }

  const response = await apiRequest<ListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/coupons`,
    {
      schema: couponListEnvelopeSchema,
      signal,
    },
  );
  return mapCouponListDto(response.data);
}

/**
 * Coupon detail. Foreign/missing → null (safe 404 surface).
 */
export async function getSellerCoupon(
  storeId: string,
  couponId: string,
  signal?: AbortSignal,
): Promise<SellerCoupon | null> {
  if (shouldUseMockFixtures("sellerOperations")) {
    return demoCoupons(storeId).find((c) => c.id === couponId) ?? null;
  }

  try {
    const response = await apiRequest<CouponEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/coupons/${encodeURIComponent(couponId)}`,
      {
        schema: couponEnvelopeSchema,
        signal,
      },
    );
    return mapCouponDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/** Create draft coupon; optional activate is a separate POST. */
export async function createSellerCoupon(
  storeId: string,
  input: CreateSellerCouponInput,
  signal?: AbortSignal,
): Promise<SellerCoupon> {
  if (shouldUseMockFixtures("sellerOperations")) {
    const body = toCreateCouponRequestBody(input);
    return {
      id: `cpn_mock_${Date.now()}`,
      storeId,
      code: body.code,
      discountKind:
        body.discountKind === "FIXED_IDR" || body.discountKind === "fixed"
          ? "FIXED_IDR"
          : "PERCENT",
      discountValue: body.discountValue,
      discountLabel:
        body.discountKind === "FIXED_IDR" || body.discountKind === "fixed"
          ? `Rp${body.discountValue.toLocaleString("id-ID")}`
          : `${body.discountValue}%`,
      usageLabel: body.maxTotalUses ? `0 / ${body.maxTotalUses}` : "0",
      endsAtLabel: body.endsAt ? body.endsAt.slice(0, 10) : "—",
      status: "Draft",
      state: "DRAFT",
      scope:
        body.scope === "SELECTED_PRODUCTS"
          ? "SELECTED_PRODUCTS"
          : "ALL_PRODUCTS",
      version: 1,
      policyVersion: 1,
      reservedCount: 0,
      redeemedCount: 0,
      usageCount: 0,
      maxTotalUses: body.maxTotalUses,
      minMerchandise: body.minMerchandise,
      endsAt: body.endsAt,
      productIds: body.productIds ?? [],
    };
  }

  const body = couponCreateRequestSchema.parse(
    toCreateCouponRequestBody(input),
  ) as CouponCreateRequest;

  const response = await apiRequest<CouponEnvelope, CouponCreateRequest>(
    `/v1/stores/${encodeURIComponent(storeId)}/coupons`,
    {
      method: "POST",
      body,
      schema: couponEnvelopeSchema,
      signal,
      idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
    },
  );
  return mapCouponDto(response.data);
}

/** Patch with expectedVersion; no status field (use activate/pause/archive). */
export async function patchSellerCoupon(
  storeId: string,
  couponId: string,
  input: PatchSellerCouponInput,
  signal?: AbortSignal,
): Promise<SellerCoupon> {
  if (shouldUseMockFixtures("sellerOperations")) {
    const existing =
      demoCoupons(storeId).find((c) => c.id === couponId) ??
      ({
        id: couponId,
        storeId,
        code: input.code ?? "CODE",
        discountKind: "PERCENT" as const,
        discountValue: input.discountValue ?? 1000,
        discountLabel: "10%",
        usageLabel: "0",
        endsAtLabel: "—",
        status: "Draft",
        state: "DRAFT" as const,
        scope: "ALL_PRODUCTS" as const,
        version: input.expectedVersion,
        policyVersion: 1,
        reservedCount: 0,
        redeemedCount: 0,
        usageCount: 0,
        productIds: [],
      } satisfies SellerCoupon);
    return {
      ...existing,
      code: input.code?.trim().toUpperCase() ?? existing.code,
      version: input.expectedVersion + 1,
    };
  }

  const body = couponPatchRequestSchema.parse(
    toPatchCouponRequestBody(input),
  ) as CouponPatchRequest;

  const response = await apiRequest<CouponEnvelope, CouponPatchRequest>(
    `/v1/stores/${encodeURIComponent(storeId)}/coupons/${encodeURIComponent(couponId)}`,
    {
      method: "PATCH",
      body,
      schema: couponEnvelopeSchema,
      signal,
    },
  );
  return mapCouponDto(response.data);
}

async function transitionCoupon(
  storeId: string,
  couponId: string,
  action: "activate" | "pause" | "archive",
  signal?: AbortSignal,
): Promise<SellerCoupon> {
  if (shouldUseMockFixtures("sellerOperations")) {
    const existing = demoCoupons(storeId).find((c) => c.id === couponId);
    const state =
      action === "activate"
        ? ("ACTIVE" as const)
        : action === "pause"
          ? ("PAUSED" as const)
          : ("ARCHIVED" as const);
    const status =
      state === "ACTIVE"
        ? "Active"
        : state === "PAUSED"
          ? "Paused"
          : "Archived";
    if (existing) {
      return { ...existing, state, status };
    }
    return {
      id: couponId,
      storeId,
      code: "CODE",
      discountKind: "PERCENT",
      discountValue: 1000,
      discountLabel: "10%",
      usageLabel: "0",
      endsAtLabel: "—",
      status,
      state,
      scope: "ALL_PRODUCTS",
      version: 1,
      policyVersion: 1,
      reservedCount: 0,
      redeemedCount: 0,
      usageCount: 0,
      productIds: [],
    };
  }

  const response = await apiRequest<CouponEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/coupons/${encodeURIComponent(couponId)}/${action}`,
    {
      method: "POST",
      schema: couponEnvelopeSchema,
      signal,
      idempotencyKey: createIdempotencyKey(),
    },
  );
  return mapCouponDto(response.data);
}

export async function activateSellerCoupon(
  storeId: string,
  couponId: string,
  signal?: AbortSignal,
): Promise<SellerCoupon> {
  return transitionCoupon(storeId, couponId, "activate", signal);
}

export async function pauseSellerCoupon(
  storeId: string,
  couponId: string,
  signal?: AbortSignal,
): Promise<SellerCoupon> {
  return transitionCoupon(storeId, couponId, "pause", signal);
}

export async function archiveSellerCoupon(
  storeId: string,
  couponId: string,
  signal?: AbortSignal,
): Promise<SellerCoupon> {
  return transitionCoupon(storeId, couponId, "archive", signal);
}

export { demoCoupons } from "./mock";
