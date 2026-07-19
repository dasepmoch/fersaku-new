/** View models for existing coupon list/form (SEL-280). */

export type CouponState =
  "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "ARCHIVED";

export type CouponDiscountKind = "PERCENT" | "FIXED_IDR";

export type CouponScope = "ALL_PRODUCTS" | "SELECTED_PRODUCTS";

export type SellerCoupon = {
  id: string;
  storeId: string;
  code: string;
  discountKind: CouponDiscountKind;
  /** bps for PERCENT; whole IDR for FIXED_IDR (server authority). */
  discountValue: number;
  discountLabel: string;
  usageLabel: string;
  endsAtLabel: string;
  /** UI Status chip label (Active / Expired / …). */
  status: string;
  state: CouponState;
  scope: CouponScope;
  version: number;
  policyVersion: number;
  reservedCount: number;
  redeemedCount: number;
  usageCount: number;
  maxTotalUses?: number;
  maxPerCustomerUses?: number;
  minMerchandise?: number;
  startsAt?: string;
  endsAt?: string;
  productIds: string[];
};

export type SellerCouponListMetrics = {
  activeCount: number;
  totalCount: number;
  /** Server usageCount sum (reserved+redeemed); not client-decremented. */
  ordersWithCoupon: number;
  /** Display-only placeholder until finance discount aggregate exists. */
  totalDiscountLabel: string;
};

export type CreateSellerCouponInput = {
  code: string;
  discountKind: "percentage" | "fixed" | "PERCENT" | "FIXED_IDR";
  /** Whole percent 1..100 or whole IDR; not fractional. */
  discountValue: number;
  percentIsBps?: boolean;
  minMerchandise?: number;
  maxTotalUses?: number;
  maxPerCustomerUses?: number;
  startsAt?: string;
  endsAt?: string;
  scope?: "ALL_PRODUCTS" | "SELECTED_PRODUCTS" | string;
  productIds?: string[];
  idempotencyKey?: string;
};

export type PatchSellerCouponInput = {
  expectedVersion: number;
  code?: string;
  discountKind?: string;
  discountValue?: number;
  percentIsBps?: boolean;
  minMerchandise?: number;
  maxTotalUses?: number;
  clearMaxTotalUses?: boolean;
  maxPerCustomerUses?: number;
  clearMaxPerCustomerUses?: boolean;
  startsAt?: string;
  clearStartsAt?: boolean;
  endsAt?: string;
  clearEndsAt?: boolean;
  scope?: string;
  productIds?: string[];
};
