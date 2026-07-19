/**
 * CHK-140 — delivery access / resend / secret lifecycle (view models).
 * Secrets live only after explicit claim; never list/detail/base order cache.
 */

/** Backend delivery kinds on access DTO. */
export type DeliveryAccessKind =
  | "DOWNLOAD"
  | "PROTECTED_LINK"
  | "CREDENTIAL"
  | "CODE";

/**
 * Claimed delivery access held in component memory only.
 * Do not put in React Query persistent cache, URL, or storage.
 */
export type DeliveryAccessClaim = {
  grantId: string;
  orderId: string;
  orderItemId: string;
  deliveryKind: DeliveryAccessKind;
  status: string;
  accessCount: number;
  maxAccesses: number;
  /** ISO expiry when present. */
  expiresAt?: string;
  /**
   * Opaque object id for DOWNLOAD/PROTECTED_LINK.
   * Not a signed URL — open/download requires future download exchange.
   */
  downloadObjectId?: string;
  /**
   * CODE/CREDENTIAL plaintext map from BE (e.g. code, username, password).
   * Cleared on unmount / actor switch / TTL policy.
   */
  secrets?: Record<string, string>;
  /** Client claim timestamp (ms) for local TTL clear. */
  claimedAtMs: number;
};

export type DeliveryResendResult = {
  grantId?: string;
  orderId?: string;
  status?: string;
  queued: boolean;
};

/** Frozen semantics for consumers and tests. */
export const DELIVERY_ACCESS_SEMANTICS = {
  baseResponses:
    "List/detail/order-result base never include secrets or signed URLs.",
  claimBoundary:
    "POST access only after explicit existing CTA; secrets component-memory only.",
  cache:
    "No React Query global/persistent cache for secrets; gcTime 0 if mutation used.",
  downloadGap:
    "downloadObjectId is opaque; buyer/guest signed download exchange not mounted — do not invent seller-scoped URLs.",
  resend: "Idempotent resend queues email; never returns secrets.",
  foreign: "Non-owner / missing → safe 404 or access denied; no enumeration.",
} as const;

/** Local secret hold TTL (ms) when BE omits expiresAt — clear after. */
export const DELIVERY_SECRET_MEMORY_TTL_MS = 5 * 60 * 1000;
