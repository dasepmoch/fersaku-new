/**
 * Checkout view models (CHK-100).
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

/**
 * Frozen QR / wallet / pay control semantics for CHK-100 (wire later in CHK-110).
 * Do not invent new QR-copy buttons without UI-080.
 */
export const CHECKOUT_QR_WALLET_SEMANTICS = {
  continueButton:
    "PRESENTATIONAL_STEP — advances details → qris UI only; does NOT create payment intent (CHK-110).",
  payButton:
    "MOCK_OR_CHK110 — mock/local may simulate; live must call createCheckoutIntent (CHK-110), never browser total.",
  walletPicker:
    "PRESENTATIONAL — existing e-wallet chips are visual preference only until provider deep-link contract freezes.",
  qrDisplay:
    "PRESENTATIONAL_UNTIL_INTENT — static QR chrome only; no copy control exists → no copy button without UI-080.",
  couponControl: "DISABLED/OUT-OF-SCOPE — no coupon input/error region on details-step; UI-080 required.",
  stockReservations:
    "INTERNAL_ONLY — browser must NOT call POST /v1/checkout/stock-reservations; create-intent owns reservation.",
} as const;
