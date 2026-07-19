/** ADM-120 — command-center KPI view model (server aggregates + asOf). */
export type AdminOverview = {
  merchantCount: number;
  buyerCount: number;
  orderCount: number;
  paymentCount: number;
  pendingWithdrawalCount: number;
  openKycCount: number;
  grossVolumePaidIdr: number;
  platformFeePaidIdr: number;
  paymentSuccessRateBps: number;
  /** Envelope meta.timestamp — never client-fabricated. */
  asOf: string;
};

/** Platform volume chart series: server IDR + display height only. */
export type AdminPlatformVolumePoint = {
  /** Server gross paid IDR for the hour bucket. */
  amountIdr: number;
  /** Relative bar height 0–100 for existing chart geometry. */
  heightPct: number;
};

export type AdminPlatformVolumeSeries = {
  points: AdminPlatformVolumePoint[];
  asOf: string;
};

/** Shared admin list filter bag (query-key + wire). */
export type AdminListFilters = {
  q?: string;
  status?: string;
  source?: string;
  cursor?: string;
  limit?: number;
  /** NumberedPageList profile when BE/meta supports page/pageSize. */
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
};

/**
 * Bounded list page foundation for ADM-200+.
 * BE currently returns cursor meta; numbered fields optional when present.
 */
export type AdminBoundedList<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  pageCount?: number;
  asOf: string;
};

export type AdminMerchant = {
  id: string;
  name: string;
  owner: string;
  email: string;
  volume: number;
  orders: number;
  risk: string;
  status: string;
  joined: string;
  /** Whether production QRIS API credentials are currently usable. */
  apiAccess: string;
};

/** ADM-200 — server finance projection for merchant detail metrics. */
export type AdminMerchantFinanceSummary = {
  merchantId: string;
  availableAmount: number;
  pendingAmount: number;
  heldAmount: number;
  lifetimeGrossAmount: number;
  lifetimeNetAmount: number;
  asOf: string;
};

/** Masked API credential metadata — never raw secret. */
export type AdminMaskedCredential = {
  id: string;
  keyPrefix: string;
  status: string;
  paymentMode: string;
  name: string;
  fingerprint: string;
};

/** Wire lifecycle status for POST /status (independent of apiAccess). */
export type AdminMerchantStatusWire = "ACTIVE" | "SUSPENDED" | "CLOSED";

/** Wire API capability for POST /api-access/status (independent of merchant.status). */
export type AdminMerchantApiAccessWire = "ACTIVE" | "SUSPENDED";

/** The surface that created a successful payment. */
export type AdminPaymentSource = "STOREFRONT" | "QRIS_API";

/** A payout can consume funds earned from one or both payment surfaces. */
export type AdminWithdrawalSource = AdminPaymentSource | "MIXED";

export type AdminTransactionSource = AdminWithdrawalSource;

export type AdminOrder = {
  id: string;
  store: string;
  customer: string;
  product: string;
  gross: number;
  /** Fee posted only after a successful payment; zero while unpaid or failed. */
  totalFeeCharged: number;
  status: string;
  payment: string;
  created: string;
  /** BE may return STOREFRONT|QRIS_API; list UI treats storefront-first. */
  source: AdminPaymentSource;
};

export type AdminPaymentIntent = {
  id: string;
  provider: string;
  merchant: string;
  amount: number;
  providerRef: string;
  status: string;
  latency: string;
  created: string;
  source: AdminPaymentSource;
};

/**
 * ADM-300 — read-only provider/local mismatch evidence.
 * UI cannot set paid or reconcile arbitrarily.
 */
export type AdminPaymentMismatch = {
  id: string;
  paymentIntentId: string;
  orderId: string;
  merchant: string;
  amount: number;
  provider: string;
  providerStatus: string;
  localStatus: string;
  age: string;
  attempts: number;
  observedAt: string;
};

/** Provider lookup acceptance (no client status mutation). */
export type AdminProviderLookupResult = {
  paymentIntentId: string;
  localStatus: string;
  provider: string;
  providerReference: string;
  source?: string;
  lookup: string;
  note?: string;
  requestId: string;
};

export type AdminDeliveryResendResult = {
  accepted: boolean;
  requestId: string;
};

export type AdminWithdrawal = {
  id: string;
  merchant: string;
  owner: string;
  amount: number;
  bank: string;
  account: string;
  risk: string;
  status:
    "Pending" | "Processing" | "On hold" | "Completed" | "Failed" | "Rejected";
  requested: string;
  source: AdminWithdrawalSource;
  /** Xendit quote/actual fee snapshot; never guessed by the UI. */
  providerProcessingFee: number | null;
  providerFeeStatus: "VERIFIED" | "POSTED" | "UNAVAILABLE";
  providerFeeReference?: string;
};

export type AdminAuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  result: string;
  time: string;
  context?: string;
  /** Server chain hashes only — never client-fabricated on API path. */
  previousHash?: string;
  integrityHash?: string;
  /** Optional server fields for detail inspector (API path). */
  requestId?: string;
  sequenceNo?: number;
  merchantId?: string;
  resourceType?: string;
  resourceId?: string;
};

/** ADM-360 — server integrity verifier projection. */
export type AdminAuditIntegrity = {
  eventCount: number;
  headSequence: number;
  minSequence: number;
  headPayloadHash?: string;
  headCreatedAt?: string;
  chainMode: string;
  /** OK | AUDIT_CHAIN_BROKEN | PENDING | … — server authority. */
  verifierStatus: string;
  chainValid: boolean;
};

/** ADM-360 — async export job handle (no local full-data CSV on API). */
export type AdminAuditExportJob = {
  id: string;
  status: string;
  redactionPolicy?: string;
  reason?: string;
  rowCount?: number | null;
  errorMessage?: string | null;
  expiresAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  downloadUrl?: string;
};

/** ADM-360 — server filter bag for audit search (no PII query keys). */
export type AdminAuditSearchFilters = {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorUserId?: string;
  limit?: number;
};

export type AdminRole = {
  id: string;
  name: string;
  description: string;
  permissions?: string[];
  members: number;
  system: boolean;
  color: string;
  /** Wire concurrency token (expectedVersion on PATCH/archive). */
  version?: number;
  code?: string;
  archivedAt?: string | null;
};

/** ADM-220 — user lookup (impersonation / staff composition). */
export type AdminUserLookup = {
  id: string;
  name: string;
  email: string;
  status: string;
  isAdmin: boolean;
  ownerMerchantId?: string | null;
  impersonatable: boolean;
  createdAt: string;
};

/** Staff row for users screen (lookup + optional role labels). */
export type AdminStaffMember = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  status: string;
  lastActive: string;
  mfaEnabled: boolean;
  isAdmin: boolean;
};

export type AdminUserRoleAssignment = {
  userId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  isSystem: boolean;
  assignedAt: string;
  assignedBy?: string;
};

/** Staff invitation list item — never carries raw invite token. */
export type AdminStaffInvitation = {
  id: string;
  email: string;
  roleId: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type AdminBuyer = {
  id: string;
  name: string;
  email: string;
  verified: string;
  purchases: number;
  spent: number;
  sessions: number;
  last: string;
};

export type AdminReview = {
  id: string;
  productId: string;
  product: string;
  seller: string;
  buyer: string;
  initials: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  status: string;
  createdAt: string;
  sellerReply?: string;
};

export type AdminPermissionGroup = {
  group: string;
  permissions: Array<[permission: string, description: string]>;
};

export type AdminBuyerPurchase = {
  orderId: string;
  product: string;
  seller: string;
  status: string;
};

export type AdminBuyerSession = {
  id: string;
  device: string;
  location: string;
  ip: string;
  active: string;
  current: boolean;
};

export type AdminInventoryField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  buyerCopyable: boolean;
};

export type AdminStockProduct = {
  id: string;
  title: string;
  type: string;
  available: number;
  reserved: number;
  sold: number;
  invalid: number;
  lowAt: number;
  delivery: string;
};

export type AdminStockItem = {
  id: string;
  /** Field names only. Secret and personal values never travel in list APIs. */
  schemaPreview: string;
  status: "Available" | "Reserved" | "Sold" | "Invalid";
  orderId?: string;
  createdAt: string;
};

export type AdminStockItemSecret = {
  itemId: string;
  values: Record<string, string>;
  expiresAt: string;
};

/** ADM-320 — delivery grant row for /admin/fulfillment (no secrets). */
export type AdminFulfillmentStatus =
  "Fulfilled" | "Failed" | "Pending" | "Revoked";

export type AdminFulfillment = {
  id: string;
  order: string;
  merchant: string;
  type: string;
  target: string;
  status: AdminFulfillmentStatus;
  attempts: number;
  time: string;
};

/** Force-fulfill / revoke acceptance — grant metadata only. */
export type AdminFulfillmentCommandResult = {
  grantId: string;
  orderId: string;
  status: string;
  requestId: string;
};
