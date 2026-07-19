/** View models for existing API keys screen (SEL-330). */

export type ApiCredentialStatus =
  | "ACTIVE"
  | "PENDING_CLAIM"
  | "PENDING_KYC"
  | "AUTHORIZED"
  | "SUSPENDED"
  | "REVOKED"
  | string;

export type SellerApiCredential = {
  id: string;
  storeId?: string;
  merchantId?: string;
  /** Masked prefix only (e.g. sk_live_abc1••••) — never full raw key. */
  displayValue: string;
  keyPrefix?: string;
  fingerprint?: string;
  paymentMode: string;
  status: ApiCredentialStatus;
  statusLabel: string;
  keyVersion?: number;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type RequestApiCredentialInput = {
  paymentMode?: "SANDBOX" | "LIVE";
  purpose?: "API_KEY" | "ROTATION" | "INITIAL_ISSUE" | "ROTATE" | string;
  reason?: string;
  mfaCode?: string;
  expectedKeyVersion?: number;
  idempotencyKey?: string;
};

/**
 * One-time claim offer after request when AUTHORIZED.
 * claimToken lives only in component memory until exchange; never query cache.
 */
export type ApiCredentialClaimOffer = {
  credential?: SellerApiCredential;
  issuanceStatus?: string;
  claimId?: string;
  claimToken?: string;
  claimExpiresAt?: string;
  paymentMode?: string;
};

/**
 * Raw API key returned once from exchange.
 * Component-local only; clear on TTL/unmount/visibility/logout.
 * Separate from webhook signingSecret (SEL-320).
 */
export type ApiKeyReveal = {
  apiKey: string;
  fingerprint?: string;
  keyPrefix?: string;
  keyVersion?: number;
  credential?: SellerApiCredential;
};

export type KycCapabilityStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "NEEDS_CLARIFICATION"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVE"
  | string;

/** Live QRIS API KYC capability — does not gate storefront. */
export type SellerKycStatus = {
  status: KycCapabilityStatus;
  /** Existing UI phrase fragment, e.g. "disetujui" / "menunggu review". */
  statusLabel: string;
  capability?: string;
  paymentMode?: string;
  liveApiEligible: boolean;
  openCaseId?: string;
  caseStatus?: string;
  requiredDocuments: string[];
  clarificationReason?: string;
  approvedAt?: string | null;
  updatedAt?: string;
};

export type CreateKycCaseInput = {
  legalName: string;
  businessName?: string;
  registrationNumber?: string;
  countryCode?: string;
  consentVersion?: string;
  submit?: boolean;
  idempotencyKey?: string;
};

export type SellerKycCase = {
  id: string;
  status: string;
  statusLabel: string;
  legalName?: string;
  businessName?: string;
  clarificationReason?: string;
  documentCount: number;
  createdAt?: string;
  updatedAt?: string;
};
