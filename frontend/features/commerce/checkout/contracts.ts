/**
 * Checkout view models (CHK-100/110).
 * Money fields are integer IDR; browser totals are never authority.
 */

/** Selection inputs allowed in a quote request (no authoritative total). */
export type CheckoutQuoteSelection = {
  storeId: string;
  productId: string;
  /** PWYW merchandise override (integer IDR); omit for catalog price. */
  merchandise?: number;
  tip?: number;
  /** Upsell line amount in IDR (0 when not selected). */
  upsell?: number;
  /** Coupon codes are OUT-OF-SCOPE until UI-080 (no coupon control on screen). */
  couponCode?: string;
};

/**
 * Server-authoritative quote mapped for existing checkout view slots.
 * Prefer `gross` for displayed total; never trust client-computed total.
 */
export type CheckoutQuote = {
  storeId: string;
  productId: string;
  merchandise: number;
  tip: number;
  upsell: number;
  eligibleSubtotal: number;
  discount: number;
  /** Authoritative payable total (integer IDR). */
  gross: number;
  couponApplied: boolean;
  couponUnavailable: boolean;
  clientDiscountIgnored: boolean;
  couponCode?: string;
};

/** Buyer identity fields for intent create (no secrets). */
export type CheckoutBuyerIdentity = {
  name: string;
  email: string;
};

/**
 * Inputs for POST /v1/checkout/intents (CHK-110).
 * Identifiers + selections only; never browser total as authority.
 */
export type CreateCheckoutIntentInput = {
  storeId: string;
  productId: string;
  buyer: CheckoutBuyerIdentity;
  /** Opaque UUID; required; same key for retry/timeout recovery. */
  idempotencyKey: string;
  /** PWYW override when product allows; omit for catalog price. */
  payWhatYouWant?: number;
  tip?: number;
  /** Same-store published product ids when upsell selected. */
  upsellProductIds?: string[];
  couponCode?: string;
};

export type CheckoutIntentStatus =
  | "REQUIRES_PAYMENT"
  | "PENDING"
  | "CANCEL_PENDING"
  | "EXPIRE_PENDING"
  | "UNKNOWN_OUTCOME"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

/**
 * Non-secret intent identity held in memory after create (CHK-110).
 * No secrets in query URL/storage; publicToken is purpose-bound capability.
 */
export type CheckoutIntent = {
  paymentIntentId: string;
  orderId: string;
  orderNumber?: string;
  status: CheckoutIntentStatus;
  amount: number;
  gross: number;
  tip: number;
  discount: number;
  fee: number;
  expiresAt?: string;
  qrString?: string | null;
  qrImageUrl?: string | null;
  /** Purpose-bound; memory only — never query/storage. */
  publicToken?: string;
  replayed: boolean;
  paymentMode?: string;
  provider?: string;
};

/**
 * Frozen QR / wallet / pay control semantics (CHK-100 freeze; CHK-110 wires pay).
 * Do not invent new QR-copy buttons without UI-080.
 */
export const CHECKOUT_QR_WALLET_SEMANTICS = {
  continueButton:
    "PRESENTATIONAL_STEP — advances details → qris UI only; does NOT create payment intent (CHK-110).",
  payButton:
    "CREATE_INTENT — mock/local may simulate; api domain calls createCheckoutIntent with opaque Idempotency-Key; never browser total.",
  walletPicker:
    "PRESENTATIONAL — existing e-wallet chips are visual preference only until provider deep-link contract freezes.",
  qrDisplay:
    "LIVE_AFTER_CREATE — render server qrString/qrImageUrl in existing container; no copy control without UI-080; never log/cache raw QR.",
  couponControl:
    "DISABLED/OUT-OF-SCOPE — no coupon input/error region on details-step; UI-080 required.",
  stockReservations:
    "INTERNAL_ONLY — browser must NOT call POST /v1/checkout/stock-reservations; create-intent owns reservation.",
  unknownNetworkOutcome:
    "LOOKUP_RECOVERY — keep same idempotency key; do not auto-mint new intent; CHK-120 polls GET intent.",
  poll: "GET /v1/checkout/intents/{id} only; bounded backoff + jitter; pause when hidden; abort on unmount/terminal; only PAID → success UI.",
  expiryCountdown:
    "Server expiresAt calibrated to client clock; never authority for paid.",
} as const;
