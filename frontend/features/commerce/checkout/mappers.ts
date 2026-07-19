/**
 * Checkout price/intent DTO → view model (CHK-100/110). Pure; no React.
 */

import type {
  CheckoutIntentDto,
  CheckoutPriceDto,
} from "@/shared/api/schemas";
import {
  invalidApiContract,
  requireSafeMoneyIdr,
} from "@/shared/api/mappers";
import type {
  CheckoutIntent,
  CheckoutIntentStatus,
  CheckoutQuote,
  CheckoutQuoteSelection,
  CreateCheckoutIntentInput,
} from "./contracts";

const INTENT_STATUSES = new Set<CheckoutIntentStatus>([
  "REQUIRES_PAYMENT",
  "PENDING",
  "CANCEL_PENDING",
  "EXPIRE_PENDING",
  "UNKNOWN_OUTCOME",
  "PAID",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);

/**
 * Build wire body for POST /v1/checkout/quote.
 * Never includes authoritative total/gross. Optional clientDiscount only for ignore tests.
 */
export function toCheckoutQuoteRequestBody(
  selection: CheckoutQuoteSelection,
  options?: { clientDiscount?: number },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    storeId: selection.storeId,
    productId: selection.productId,
  };
  if (selection.merchandise !== undefined) {
    body.merchandise = requireSafeMoneyIdr(
      selection.merchandise,
      "merchandise",
    );
  }
  if (selection.tip !== undefined && selection.tip > 0) {
    body.tip = requireSafeMoneyIdr(selection.tip, "tip");
  }
  if (selection.upsell !== undefined && selection.upsell > 0) {
    body.upsell = requireSafeMoneyIdr(selection.upsell, "upsell");
  }
  if (selection.couponCode !== undefined && selection.couponCode.trim() !== "") {
    body.couponCode = selection.couponCode.trim();
  }
  if (options?.clientDiscount !== undefined) {
    body.clientDiscount = requireSafeMoneyIdr(
      options.clientDiscount,
      "clientDiscount",
    );
  }
  return body;
}

/** Map server CheckoutPrice DTO to checkout view quote. Fail-closed on money. */
export function mapCheckoutPriceDto(dto: CheckoutPriceDto): CheckoutQuote {
  const merchandise = requireSafeMoneyIdr(dto.merchandise, "merchandise");
  const discount = requireSafeMoneyIdr(dto.discount, "discount");
  const gross = requireSafeMoneyIdr(dto.gross, "gross");
  const tip =
    dto.tip !== undefined ? requireSafeMoneyIdr(dto.tip, "tip") : 0;
  const upsell =
    dto.upsell !== undefined ? requireSafeMoneyIdr(dto.upsell, "upsell") : 0;
  const eligibleSubtotal =
    dto.eligibleSubtotal !== undefined
      ? requireSafeMoneyIdr(dto.eligibleSubtotal, "eligibleSubtotal")
      : merchandise;

  if (gross < 0 || discount < 0 || merchandise < 0) {
    return invalidApiContract("Checkout price money out of range", {
      issues: [{ path: "gross", message: "must be non-negative safe integer" }],
    });
  }

  const quote: CheckoutQuote = {
    storeId: dto.storeId ?? "",
    productId: dto.productId ?? "",
    merchandise,
    tip,
    upsell,
    eligibleSubtotal,
    discount,
    gross,
    couponApplied: dto.couponApplied,
    couponUnavailable: dto.couponUnavailable ?? false,
    clientDiscountIgnored: dto.clientDiscountIgnored,
  };
  if (dto.couponCode) quote.couponCode = dto.couponCode;
  return quote;
}

/**
 * Local mock quote math mirrors BE BuildPriceSnapshot (no coupon).
 * Used only when domain source is mock — never as live authority.
 */
export function buildMockCheckoutQuote(
  selection: CheckoutQuoteSelection,
  catalogPrice: number,
): CheckoutQuote {
  const merch =
    selection.merchandise !== undefined && selection.merchandise > 0
      ? selection.merchandise
      : catalogPrice;
  const tip = selection.tip ?? 0;
  const upsell = selection.upsell ?? 0;
  const merchandise = requireSafeMoneyIdr(merch, "merchandise");
  const tipSafe = requireSafeMoneyIdr(tip, "tip");
  const upsellSafe = requireSafeMoneyIdr(upsell, "upsell");
  const discount = 0;
  const gross = merchandise - discount + tipSafe + upsellSafe;
  return {
    storeId: selection.storeId,
    productId: selection.productId,
    merchandise,
    tip: tipSafe,
    upsell: upsellSafe,
    eligibleSubtotal: merchandise,
    discount,
    gross: requireSafeMoneyIdr(Math.max(0, gross), "gross"),
    couponApplied: false,
    couponUnavailable: false,
    clientDiscountIgnored: true,
  };
}

/** Integer IDR clamp for PWYW UX input (server still authoritative). */
export function clampIntegerIdr(value: number, min: number): number {
  if (!Number.isFinite(value)) return min;
  const n = Math.trunc(value);
  if (n < min) return min;
  if (!Number.isSafeInteger(n)) return min;
  return n;
}

/**
 * Build wire body for POST /v1/checkout/intents.
 * Never includes authoritative total/gross. Client money fields omitted.
 */
export function toCreateCheckoutIntentRequestBody(
  input: CreateCheckoutIntentInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    storeId: input.storeId,
    productId: input.productId,
    buyerEmail: input.buyer.email.trim(),
    buyerName: input.buyer.name.trim(),
  };
  if (input.payWhatYouWant !== undefined && input.payWhatYouWant > 0) {
    body.payWhatYouWant = requireSafeMoneyIdr(
      input.payWhatYouWant,
      "payWhatYouWant",
    );
  }
  if (input.tip !== undefined && input.tip > 0) {
    body.tip = requireSafeMoneyIdr(input.tip, "tip");
  }
  if (input.upsellProductIds && input.upsellProductIds.length > 0) {
    body.upsellProductIds = input.upsellProductIds.filter(
      (id) => typeof id === "string" && id.trim() !== "",
    );
  }
  if (input.couponCode !== undefined && input.couponCode.trim() !== "") {
    body.couponCode = input.couponCode.trim();
  }
  return body;
}

function mapIntentStatus(raw: string): CheckoutIntentStatus {
  if (INTENT_STATUSES.has(raw as CheckoutIntentStatus)) {
    return raw as CheckoutIntentStatus;
  }
  return invalidApiContract("Unknown checkout intent status", {
    issues: [{ path: "status", message: `unsupported: ${raw}` }],
  });
}

/** Map server CheckoutIntent DTO to in-memory view model. Fail-closed on money. */
export function mapCheckoutIntentDto(dto: CheckoutIntentDto): CheckoutIntent {
  const amount = requireSafeMoneyIdr(dto.amount, "amount");
  const gross =
    dto.gross !== undefined
      ? requireSafeMoneyIdr(dto.gross, "gross")
      : amount;
  const tip =
    dto.tip !== undefined ? requireSafeMoneyIdr(dto.tip, "tip") : 0;
  const discount =
    dto.discount !== undefined
      ? requireSafeMoneyIdr(dto.discount, "discount")
      : 0;
  const fee =
    dto.fee !== undefined ? requireSafeMoneyIdr(dto.fee, "fee") : 0;

  if (amount < 0 || gross < 0) {
    return invalidApiContract("Checkout intent money out of range", {
      issues: [{ path: "amount", message: "must be non-negative safe integer" }],
    });
  }

  const intent: CheckoutIntent = {
    paymentIntentId: dto.paymentIntentId,
    orderId: dto.orderId,
    status: mapIntentStatus(dto.status),
    amount,
    gross,
    tip,
    discount,
    fee,
    replayed: dto.replayed === true,
  };
  if (dto.orderNumber) intent.orderNumber = dto.orderNumber;
  if (dto.expiresAt) intent.expiresAt = dto.expiresAt;
  if (dto.qrString !== undefined) intent.qrString = dto.qrString;
  if (dto.qrImageUrl !== undefined) intent.qrImageUrl = dto.qrImageUrl;
  if (dto.publicToken) intent.publicToken = dto.publicToken;
  if (dto.paymentMode) intent.paymentMode = dto.paymentMode;
  if (dto.provider) intent.provider = dto.provider;
  return intent;
}
