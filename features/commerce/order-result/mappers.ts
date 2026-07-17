/**
 * Order result DTO → view model (CHK-130). Pure; no React.
 * Path URL status is never consulted here.
 */

import type { OrderResultDto } from "@/shared/api/schemas";
import {
  invalidApiContract,
  requireSafeMoneyIdr,
} from "@/shared/api/mappers";
import type {
  OrderResult,
  OrderResultDisplayState,
} from "./contracts";

const DISPLAY_PALETTE = "#eef3e9";
const DISPLAY_GLYPH = "•";

/**
 * Map backend payment/order status → existing page chrome key.
 * Only PAID → success. Pending/unpaid stay pending. Failed/expired/cancelled → failed.
 */
export function mapPaymentStatusToDisplayState(
  paymentStatus: string,
  orderStatus?: string,
): OrderResultDisplayState {
  const pay = paymentStatus.trim().toUpperCase();
  const ord = (orderStatus ?? "").trim().toUpperCase();
  if (pay === "PAID" || ord === "PAID") return "success";
  if (
    pay === "FAILED" ||
    pay === "EXPIRED" ||
    pay === "CANCELLED" ||
    pay === "CANCELED" ||
    ord === "FAILED" ||
    ord === "EXPIRED" ||
    ord === "CANCELLED" ||
    ord === "CANCELED"
  ) {
    return "failed";
  }
  return "pending";
}

/**
 * Whether path segment is a known pretty status (presentational).
 * Unknown segments are non-authoritative noise — ignored.
 */
export function isKnownOrderResultPathStatus(
  status: string,
): status is OrderResultDisplayState {
  return status === "success" || status === "pending" || status === "failed";
}

/**
 * Canonical path for order result after backend map.
 * Uses orderNumber when present for stable pretty id; never open-redirects.
 */
export function canonicalOrderResultPath(result: OrderResult): string {
  const id = encodeURIComponent(result.orderNumber || result.orderId);
  return `/orders/${id}/${result.displayState}`;
}

/** Map GET /v1/orders/{orderId} DTO. Fail-closed on money when present. */
export function mapOrderResultDto(dto: OrderResultDto): OrderResult {
  const paymentStatus = dto.paymentStatus.trim();
  if (!paymentStatus) {
    return invalidApiContract("Order result missing paymentStatus", {
      issues: [{ path: "paymentStatus", message: "required" }],
    });
  }

  const grossRaw = dto.gross ?? dto.amount ?? 0;
  const gross = requireSafeMoneyIdr(grossRaw, "gross");
  const tip =
    dto.tip !== undefined ? requireSafeMoneyIdr(dto.tip, "tip") : 0;

  if (gross < 0 || tip < 0) {
    return invalidApiContract("Order result money out of range", {
      issues: [{ path: "gross", message: "must be non-negative safe integer" }],
    });
  }

  const displayState = mapPaymentStatusToDisplayState(
    paymentStatus,
    dto.orderStatus,
  );

  const result: OrderResult = {
    orderId: dto.orderId,
    displayState,
    paymentStatus,
    gross,
    tip,
    productTitle:
      (dto.productTitle && dto.productTitle.trim()) ||
      dto.orderNumber ||
      "Pesanan",
    palette: DISPLAY_PALETTE,
    glyph: DISPLAY_GLYPH,
    // Success shell only — no secrets; real download is CHK-140.
    deliveryReadyShell: displayState === "success",
  };
  if (dto.orderNumber) result.orderNumber = dto.orderNumber;
  if (dto.orderStatus) result.orderStatus = dto.orderStatus;
  if (dto.productId) result.productId = dto.productId;
  if (dto.productSlug) result.productSlug = dto.productSlug;
  if (dto.storeSlug) result.storeSlug = dto.storeSlug;
  return result;
}

/**
 * Build a mock order result for domain mock fixtures.
 * URL status is still ignored by callers — mock uses explicit paymentStatus.
 */
export function buildMockOrderResult(input: {
  orderId: string;
  paymentStatus: string;
  gross?: number;
  productTitle?: string;
  productId?: string;
  productSlug?: string;
  storeSlug?: string;
}): OrderResult {
  return mapOrderResultDto({
    orderId: input.orderId,
    orderNumber: input.orderId.startsWith("FRS-") ? input.orderId : undefined,
    paymentStatus: input.paymentStatus,
    gross: input.gross ?? 79_000,
    tip: 0,
    productTitle: input.productTitle ?? "AI Prompt Pack",
    productId: input.productId,
    productSlug: input.productSlug,
    storeSlug: input.storeSlug ?? "asep-ai-tools",
  });
}
