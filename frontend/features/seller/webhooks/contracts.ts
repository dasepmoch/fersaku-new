/** View models for existing webhook list/test UI (SEL-320). */

export type WebhookEndpointStatus =
  | "PENDING_VERIFICATION"
  | "PENDING_SECRET_CLAIM"
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED"
  | string;

export type SellerWebhookEndpoint = {
  id: string;
  storeId?: string;
  merchantId?: string;
  paymentMode: string;
  /** Full URL when BE returns it (edit); list may use host only. */
  url: string;
  urlHost: string;
  status: WebhookEndpointStatus;
  /** UI chip: Active / Pending / Suspended / … */
  statusLabel: string;
  configVersion: number;
  eventAllowlist: string[];
  currentSecretVersion?: number;
  failureCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export type WebhookDeliveryStatus =
  "QUEUED" | "DELIVERED" | "RETRYING" | "DEAD_LETTER" | "CANCELLED" | string;

export type SellerWebhookDelivery = {
  deliveryId: string;
  endpointId: string;
  eventType: string;
  eventId?: string;
  status: WebhookDeliveryStatus;
  isTest: boolean;
  attemptCount: number;
  lastHttpStatus?: number;
  lastLatencyMs?: number;
  /** UI: `200 OK` / `500 Error` / status string. */
  responseLabel: string;
  /** UI: `84 ms` / `—`. */
  latencyLabel: string;
  createdAt?: string;
};

export type CreateSellerWebhookInput = {
  url: string;
  paymentMode: "SANDBOX" | "LIVE";
  eventAllowlist?: string[];
  idempotencyKey?: string;
};

export type UpdateSellerWebhookInput = {
  url?: string;
  eventAllowlist?: string[];
  disable?: boolean;
  reason?: string;
};

/**
 * One-time claim offer after create/rotate.
 * claimToken lives only in component memory until exchange; never query cache.
 */
export type WebhookSecretClaimOffer = {
  endpoint: SellerWebhookEndpoint;
  claimToken: string;
  claimExpiresAt?: string;
  secretVersion?: number;
};

/**
 * Raw signing secret returned once from exchange.
 * Component-local only; clear on TTL/unmount/visibility/logout.
 */
export type WebhookSigningSecretReveal = {
  signingSecret: string;
  fingerprint?: string;
  secretVersion?: number;
  endpoint?: SellerWebhookEndpoint;
};

export type TestWebhookResult = SellerWebhookDelivery;
