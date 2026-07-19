/**
 * Order result view models (CHK-130).
 * URL path `[status]` is presentational only — never authority.
 * Delivery secrets never live on this surface (CHK-140).
 */

/** Existing success/pending/failed chrome keys on the order status page. */
export type OrderResultDisplayState = "success" | "pending" | "failed";

/**
 * Mapped order snapshot for `/orders/[orderId]/[status]`.
 * Money is integer IDR from backend; browser total/query never authority.
 */
export type OrderResult = {
  orderId: string;
  /** Pretty public number when present; used for display and path canonicalize. */
  orderNumber?: string;
  /** Canonical display key derived from backend payment/order state only. */
  displayState: OrderResultDisplayState;
  paymentStatus: string;
  orderStatus?: string;
  gross: number;
  tip: number;
  productId?: string;
  productTitle: string;
  productSlug?: string;
  storeSlug?: string;
  /** Display palette/glyph for ProductArt chrome (defaults when BE omits). */
  palette: string;
  glyph: string;
  /**
   * When true, success chrome may show existing download shell geometry only.
   * Raw secrets / signed URLs never set here (CHK-140).
   */
  deliveryReadyShell: boolean;
};

/**
 * Frozen order-result capability semantics (CHK-130).
 * Do not put capability tokens in query/path/log/storage.
 */
export const ORDER_RESULT_CAPABILITY_SEMANTICS = {
  pathStatus:
    "PRESENTATIONAL_ONLY — never authority; render backend paymentStatus/orderStatus only.",
  authorization:
    "Authenticated buyer owner (session cookie) and/or purpose-bound guest capability; ID alone is insufficient at policy level.",
  capabilityTransport:
    "Memory or HttpOnly/scoped exchange only — never query string, path, analytics, or logs. Optional X-Order-Capability header when raw token held in memory.",
  fragmentBootstrap:
    "If fragment token present: client scrub then exchange before fetch; never leave raw token in URL after first tick.",
  foreignOrInvalid: "Generic safe not-found — no existence enumeration.",
  deliverySecrets:
    "OUT_OF_SCOPE on base result — CHK-140 access exchange only.",
  invoice:
    "CHK-150: owner session invoice; guest CTA login-gated (no guest invoice capability exchange advertised).",
  canonicalize:
    "Mismatched path status may redirect to backend-derived status path; no open redirect.",
} as const;

/** Known path status segments that map to existing chrome (others ignored). */
export const ORDER_RESULT_PATH_STATUSES = [
  "success",
  "pending",
  "failed",
] as const;

/** Optional header for purpose-bound guest capability (never query). */
export const ORDER_CAPABILITY_HEADER = "X-Order-Capability";
