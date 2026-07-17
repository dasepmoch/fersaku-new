/**
 * ADM-120 — admin read DTO → existing view models.
 * Pure; no React. Money/aggregates stay server-authoritative.
 */

import { compactRupiah } from "@/shared/format/money";
import type {
  AdminAuditEventDto,
  AdminAuditExportDto,
  AdminAuditIntegrityDto,
  AdminBuyerDto,
  AdminBuyerPurchaseDto,
  AdminBuyerSessionDto,
  AdminMaskedCredentialDto,
  AdminMerchantDto,
  AdminMerchantFinanceSummaryDto,
  AdminOrderDto,
  AdminOverviewDto,
  AdminPaymentDto,
  AdminPaymentMismatchDto,
  AdminProviderLookupResultDto,
  AdminPermissionRegistryItemDto,
  AdminReviewDto,
  AdminRoleDto,
  AdminStaffInvitationDto,
  AdminUserLookupDto,
  AdminUserRoleAssignmentDto,
  AdminWithdrawalDto,
  AdminBoundedListMeta,
  AdminDeliveryGrantDto,
  AdminFulfillmentDto,
  AdminInventorySnapshotDto,
  InventoryRevealDto,
} from "@/shared/api/schemas";
import type {
  AdminAuditEvent,
  AdminAuditExportJob,
  AdminAuditIntegrity,
  AdminAuditSearchFilters,
  AdminBuyer,
  AdminBuyerPurchase,
  AdminBuyerSession,
  AdminFulfillment,
  AdminFulfillmentCommandResult,
  AdminFulfillmentStatus,
  AdminMaskedCredential,
  AdminMerchant,
  AdminMerchantApiAccessWire,
  AdminMerchantFinanceSummary,
  AdminMerchantStatusWire,
  AdminOrder,
  AdminPaymentIntent,
  AdminPaymentMismatch,
  AdminPaymentSource,
  AdminProviderLookupResult,
  AdminPermissionGroup,
  AdminReview,
  AdminRole,
  AdminStaffInvitation,
  AdminStaffMember,
  AdminStockItem,
  AdminStockItemSecret,
  AdminUserLookup,
  AdminUserRoleAssignment,
  AdminWithdrawal,
  AdminWithdrawalSource,
} from "./contracts";
import type {
  AdminBoundedList,
  AdminListFilters,
  AdminOverview,
  AdminPlatformVolumeSeries,
} from "./contracts";

function nonNegInt(value: number): number {
  return Math.max(0, Math.trunc(value));
}

function nonNegMoney(value: number): number {
  return Math.max(0, Math.trunc(value));
}

/** Format payment success bps for existing overview metric geometry. */
export function formatSuccessRateBps(bps: number): string {
  const pct = nonNegInt(bps) / 100;
  return `${pct.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function formatCountId(value: number): string {
  return nonNegInt(value).toLocaleString("id-ID");
}

export function mapAdminOverviewDto(
  dto: AdminOverviewDto,
  asOf: string,
): AdminOverview {
  return {
    merchantCount: nonNegInt(dto.merchantCount),
    buyerCount: nonNegInt(dto.buyerCount),
    orderCount: nonNegInt(dto.orderCount),
    paymentCount: nonNegInt(dto.paymentCount),
    pendingWithdrawalCount: nonNegInt(dto.pendingWithdrawalCount),
    openKycCount: nonNegInt(dto.openKycCount),
    grossVolumePaidIdr: nonNegMoney(dto.grossVolumePaidIdr),
    platformFeePaidIdr: nonNegMoney(dto.platformFeePaidIdr),
    paymentSuccessRateBps: nonNegInt(dto.paymentSuccessRateBps),
    asOf,
  };
}

/**
 * Map 24 hourly IDR buckets to chart geometry without inventing money totals.
 * heightPct is relative display only; amountIdr is server truth for tooltips.
 */
export function mapPlatformVolumeBuckets(
  amountsIdr: number[],
  asOf: string,
): AdminPlatformVolumeSeries {
  const amounts = amountsIdr.map((v) => nonNegMoney(v));
  const max = amounts.reduce((m, v) => (v > m ? v : m), 0);
  const points = amounts.map((amountIdr) => ({
    amountIdr,
    heightPct:
      max <= 0 ? 0 : Math.max(2, Math.round((amountIdr / max) * 100)),
  }));
  return { points, asOf };
}

/** Prototype mock heights (0–132) → series with synthetic display amounts. */
export function mapMockPlatformVolumeHeights(
  heights: number[],
  asOf: string,
): AdminPlatformVolumeSeries {
  return {
    points: heights.map((h) => {
      const height = Math.max(0, Math.trunc(h));
      return {
        heightPct: Math.min(100, Math.round(height / 1.35)),
        amountIdr: height * 18_000,
      };
    }),
    asOf,
  };
}

export function mapAdminMerchantDto(dto: AdminMerchantDto): AdminMerchant {
  return {
    id: dto.id,
    name: dto.name,
    owner: dto.owner,
    email: dto.email,
    volume: nonNegMoney(dto.volume),
    orders: nonNegInt(dto.orders),
    risk: dto.risk,
    status: dto.status,
    joined: dto.joined,
    apiAccess: dto.apiAccess,
  };
}

/**
 * Map FE display status → wire enum for POST /status.
 * Merchant lifecycle is independent of API capability axis.
 */
export function toMerchantStatusWire(
  display: string,
): AdminMerchantStatusWire | null {
  const s = display.trim().toLowerCase();
  if (s === "active" || s === "enabled") return "ACTIVE";
  if (s === "suspended") return "SUSPENDED";
  if (s === "closed") return "CLOSED";
  if (s === "restricted") return "SUSPENDED";
  const upper = display.trim().toUpperCase();
  if (upper === "ACTIVE" || upper === "SUSPENDED" || upper === "CLOSED") {
    return upper;
  }
  return null;
}

/**
 * Map FE display apiAccess → wire enum for POST /api-access/status.
 * Pending KYC / Not requested are not mutatable via this control.
 */
export function toMerchantApiAccessWire(
  display: string,
): AdminMerchantApiAccessWire | null {
  const s = display.trim().toLowerCase();
  if (s === "enabled" || s === "active") return "ACTIVE";
  if (s === "suspended") return "SUSPENDED";
  const upper = display.trim().toUpperCase();
  if (upper === "ACTIVE" || upper === "SUSPENDED") return upper;
  return null;
}

/** Humanize wire merchant status for existing AdminStatus chrome. */
export function humanizeMerchantStatus(wire: string): string {
  switch (wire.trim().toUpperCase()) {
    case "ACTIVE":
      return "Active";
    case "SUSPENDED":
      return "Suspended";
    case "CLOSED":
      return "Closed";
    default:
      return wire;
  }
}

/** Humanize wire API access for existing AdminStatus chrome. */
export function humanizeMerchantApiAccess(wire: string): string {
  switch (wire.trim().toUpperCase()) {
    case "ACTIVE":
      return "Enabled";
    case "SUSPENDED":
      return "Suspended";
    case "PENDING_KYC":
      return "Pending KYC";
    case "INACTIVE":
    case "EXPIRED":
    case "REVOKED":
    case "":
      return "Not requested";
    default:
      return wire;
  }
}

export function mapAdminMerchantFinanceSummaryDto(
  dto: AdminMerchantFinanceSummaryDto,
  asOf: string,
): AdminMerchantFinanceSummary {
  return {
    merchantId: dto.merchantId,
    availableAmount: nonNegMoney(dto.availableAmount),
    pendingAmount: nonNegMoney(dto.pendingAmount),
    heldAmount: nonNegMoney(dto.heldAmount),
    lifetimeGrossAmount: nonNegMoney(dto.lifetimeGrossAmount ?? 0),
    lifetimeNetAmount: nonNegMoney(dto.lifetimeNetAmount ?? 0),
    asOf: dto.asOf ?? asOf,
  };
}

export function mapAdminMaskedCredentialDto(
  dto: AdminMaskedCredentialDto,
): AdminMaskedCredential {
  return {
    id: dto.id,
    keyPrefix: dto.keyPrefix ?? "",
    status: dto.status,
    paymentMode: dto.paymentMode ?? "",
    name: dto.name ?? "",
    fingerprint: dto.fingerprint ?? "",
  };
}

/** Next suspend/restore display labels for existing access dialog (no redesign). */
export function nextMerchantStatusDisplay(current: string): string {
  return current === "Suspended" ? "Active" : "Suspended";
}

export function nextMerchantApiAccessDisplay(current: string): string {
  return current === "Suspended" ? "Enabled" : "Suspended";
}

export function mapAdminBuyerDto(dto: AdminBuyerDto): AdminBuyer {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    verified: dto.verified,
    purchases: nonNegInt(dto.purchases),
    spent: nonNegMoney(dto.spent),
    sessions: nonNegInt(dto.sessions),
    last: dto.last,
  };
}

/** Purchase shell only — never maps delivery secret/credential/code fields. */
export function mapAdminBuyerPurchaseDto(
  dto: AdminBuyerPurchaseDto,
): AdminBuyerPurchase {
  return {
    orderId: dto.orderId,
    product: dto.product,
    seller: dto.seller,
    status: dto.status,
  };
}

/** Session metadata only — no tokens or raw auth material. */
export function mapAdminBuyerSessionDto(
  dto: AdminBuyerSessionDto,
): AdminBuyerSession {
  return {
    id: dto.id,
    device: dto.device,
    location: dto.location,
    ip: dto.ip,
    active: dto.active,
    current: Boolean(dto.current),
  };
}

/** Runtime guard: admin buyer support projections must not carry secrets. */
export function assertNoSecretsInAdminBuyerProjection(value: unknown): void {
  const blob = JSON.stringify(value ?? null).toLowerCase();
  const forbidden = [
    "password",
    "rawkey",
    "raw_key",
    "deliverysecret",
    "delivery_secret",
    "credentialfields",
    "fsk_live_",
    "fsk_test_",
    "magiclinktoken",
    "magic_link_token",
  ];
  for (const key of forbidden) {
    if (blob.includes(key)) {
      throw new Error(`Admin buyer projection must not include secret material (${key})`);
    }
  }
}

function mapPaymentSource(raw: string): AdminPaymentSource {
  return raw === "QRIS_API" ? "QRIS_API" : "STOREFRONT";
}

function mapWithdrawalSource(raw: string): AdminWithdrawalSource {
  if (raw === "MIXED") return "MIXED";
  if (raw === "QRIS_API") return "QRIS_API";
  return "STOREFRONT";
}

export function mapAdminOrderDto(dto: AdminOrderDto): AdminOrder {
  return {
    id: dto.id,
    store: dto.store,
    customer: dto.customer,
    product: dto.product,
    gross: nonNegMoney(dto.gross),
    totalFeeCharged: nonNegMoney(dto.totalFeeCharged),
    status: mapAdminOrderStatusDisplay(dto.status),
    payment: dto.payment,
    created: dto.created,
    source: mapPaymentSource(dto.source),
  };
}

export function mapAdminPaymentDto(dto: AdminPaymentDto): AdminPaymentIntent {
  return {
    id: dto.id,
    provider: dto.provider,
    merchant: dto.merchant,
    amount: nonNegMoney(dto.amount),
    providerRef: dto.providerRef,
    status: mapAdminPaymentStatusDisplay(dto.status),
    latency: dto.latency,
    created: dto.created,
    source: mapPaymentSource(dto.source),
  };
}

/**
 * ADM-300 — display status for AdminStatus chrome.
 * UNKNOWN_OUTCOME / provider unavailable must not look like success.
 */
export function mapAdminPaymentStatusDisplay(raw: string): string {
  const s = raw.trim();
  const upper = s.toUpperCase();
  if (
    upper === "UNKNOWN_OUTCOME" ||
    upper === "UNKNOWN" ||
    upper.includes("UNKNOWN")
  ) {
    return "Unknown outcome";
  }
  if (upper === "PROVIDER_UNAVAILABLE" || upper === "UNAVAILABLE") {
    return "Provider unavailable";
  }
  return s;
}

export function mapAdminOrderStatusDisplay(raw: string): string {
  return mapAdminPaymentStatusDisplay(raw);
}

export function mapAdminPaymentMismatchDto(
  dto: AdminPaymentMismatchDto,
): AdminPaymentMismatch {
  return {
    id: dto.id,
    paymentIntentId: dto.paymentIntentId,
    orderId: dto.orderId,
    merchant: dto.merchant,
    amount: nonNegMoney(dto.amount),
    provider: dto.provider,
    providerStatus: dto.providerStatus,
    localStatus: dto.localStatus,
    age: dto.age?.trim() || formatMismatchAge(dto.observedAt),
    attempts: nonNegInt(dto.attempts),
    observedAt: dto.observedAt,
  };
}

function formatMismatchAge(observedAt: string): string {
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function mapAdminProviderLookupResultDto(
  dto: AdminProviderLookupResultDto,
  requestId: string,
): AdminProviderLookupResult {
  return {
    paymentIntentId: dto.paymentIntentId,
    localStatus: mapAdminPaymentStatusDisplay(dto.localStatus),
    provider: dto.provider,
    providerReference: dto.providerReference ?? "",
    ...(dto.source ? { source: dto.source } : {}),
    lookup: dto.lookup,
    ...(dto.note ? { note: dto.note } : {}),
    requestId,
  };
}

/**
 * Fee split for order detail chrome: server totalFeeCharged is authoritative.
 * Processing fee is not inventable — show total fee only when breakdown missing.
 * Returns zeros for unpaid (totalFeeCharged === 0); never fabricates net from client %.
 */
export function mapAdminOrderFeeDisplay(order: AdminOrder): {
  platformFee: number;
  processingFee: number;
  sellerNet: number;
  totalFee: number;
} {
  const totalFee = nonNegMoney(order.totalFeeCharged);
  const gross = nonNegMoney(order.gross);
  if (totalFee <= 0) {
    return {
      platformFee: 0,
      processingFee: 0,
      sellerNet: 0,
      totalFee: 0,
    };
  }
  // No BE fee breakdown on list DTO — show total as platform fee; processing unknown.
  return {
    platformFee: totalFee,
    processingFee: 0,
    sellerNet: Math.max(0, gross - totalFee),
    totalFee,
  };
}

const WITHDRAWAL_STATUSES = new Set([
  "Pending",
  "Processing",
  "On hold",
  "Completed",
  "Failed",
  "Rejected",
]);

export function mapAdminWithdrawalDto(
  dto: AdminWithdrawalDto,
): AdminWithdrawal {
  const status = WITHDRAWAL_STATUSES.has(dto.status)
    ? (dto.status as AdminWithdrawal["status"])
    : "Pending";
  const feeStatus =
    dto.providerFeeStatus === "VERIFIED" ||
    dto.providerFeeStatus === "POSTED" ||
    dto.providerFeeStatus === "UNAVAILABLE"
      ? dto.providerFeeStatus
      : "UNAVAILABLE";
  return {
    id: dto.id,
    merchant: dto.merchant,
    owner: dto.owner,
    amount: nonNegMoney(dto.amount),
    bank: dto.bank,
    account: dto.account,
    risk: dto.risk,
    status,
    requested: dto.requested,
    source: mapWithdrawalSource(dto.source),
    providerProcessingFee:
      dto.providerProcessingFee === null
        ? null
        : nonNegMoney(dto.providerProcessingFee),
    providerFeeStatus: feeStatus,
    ...(dto.providerFeeReference
      ? { providerFeeReference: dto.providerFeeReference }
      : {}),
  };
}

function auditOptionalString(
  value: string | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  const t = String(value).trim();
  return t.length > 0 ? t : undefined;
}

function auditDisplayTime(
  createdAt: string | number | undefined,
  timeAlias: string | undefined,
): string {
  if (typeof timeAlias === "string" && timeAlias.trim()) return timeAlias.trim();
  if (createdAt == null) return "—";
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return new Date(createdAt).toISOString();
  }
  const s = String(createdAt).trim();
  return s || "—";
}

function auditMetadataString(
  meta: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!meta) return undefined;
  const v = meta[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/**
 * ADM-360 — map BE audit wire → existing AdminAuditEvent display contract.
 * Never fabricates IP/result/hash when absent from server payload.
 */
export function mapAdminAuditEventDto(
  dto: AdminAuditEventDto,
): AdminAuditEvent {
  const action =
    auditOptionalString(dto.action) ??
    auditOptionalString(dto.metadata?.action as string | undefined) ??
    "—";
  const actor =
    auditOptionalString(dto.actor) ??
    auditMetadataString(dto.metadata, "actorEmail") ??
    auditMetadataString(dto.metadata, "actor") ??
    auditOptionalString(dto.actorUserId) ??
    "—";
  const resourceType = auditOptionalString(dto.resourceType);
  const resourceId = auditOptionalString(dto.resourceId);
  const target =
    auditOptionalString(dto.target) ??
    (resourceType && resourceId
      ? `${resourceType}:${resourceId}`
      : resourceId ?? resourceType ?? "—");
  const ip =
    auditOptionalString(dto.ip) ??
    auditMetadataString(dto.metadata, "ip") ??
    auditMetadataString(dto.metadata, "ipAddress") ??
    "—";
  const result =
    auditOptionalString(dto.result) ??
    auditMetadataString(dto.metadata, "result") ??
    auditMetadataString(dto.metadata, "outcome") ??
    "—";
  const context =
    auditOptionalString(dto.context) ??
    auditOptionalString(dto.reason) ??
    auditMetadataString(dto.metadata, "context");
  const integrityHash =
    auditOptionalString(dto.integrityHash) ??
    auditOptionalString(dto.payloadHash);
  const previousHash = auditOptionalString(dto.previousHash);
  const requestId = auditOptionalString(dto.requestId);
  const merchantId = auditOptionalString(dto.merchantId);

  return {
    id: dto.id,
    actor,
    action,
    target,
    ip,
    result,
    time: auditDisplayTime(dto.createdAt, dto.time),
    ...(context ? { context } : {}),
    ...(previousHash ? { previousHash } : {}),
    ...(integrityHash ? { integrityHash } : {}),
    ...(requestId ? { requestId } : {}),
    ...(typeof dto.sequenceNo === "number"
      ? { sequenceNo: dto.sequenceNo }
      : {}),
    ...(merchantId ? { merchantId } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(resourceId ? { resourceId } : {}),
  };
}

export function mapAdminAuditIntegrityDto(
  dto: AdminAuditIntegrityDto,
): AdminAuditIntegrity {
  const status = String(dto.verifierStatus ?? "").trim();
  const chainValid = status === "OK";
  const headHash = auditOptionalString(
    dto.headPayloadHash == null ? undefined : String(dto.headPayloadHash),
  );
  let headCreatedAt: string | undefined;
  if (dto.headCreatedAt != null) {
    if (typeof dto.headCreatedAt === "number") {
      headCreatedAt = new Date(dto.headCreatedAt).toISOString();
    } else {
      const s = String(dto.headCreatedAt).trim();
      headCreatedAt = s || undefined;
    }
  }
  return {
    eventCount: Math.max(0, Math.trunc(dto.eventCount)),
    headSequence: Math.max(0, Math.trunc(dto.headSequence)),
    minSequence: Math.max(0, Math.trunc(dto.minSequence)),
    ...(headHash ? { headPayloadHash: headHash } : {}),
    ...(headCreatedAt ? { headCreatedAt } : {}),
    chainMode: String(dto.chainMode || "—"),
    verifierStatus: status || "—",
    chainValid,
  };
}

export function mapAdminAuditExportDto(
  dto: AdminAuditExportDto,
): AdminAuditExportJob {
  const toIso = (v: string | number | null | undefined): string | null | undefined => {
    if (v == null) return v === null ? null : undefined;
    if (typeof v === "number") return new Date(v).toISOString();
    const s = String(v).trim();
    return s || null;
  };
  return {
    id: dto.id,
    status: dto.status,
    ...(dto.redactionPolicy ? { redactionPolicy: dto.redactionPolicy } : {}),
    ...(dto.reason ? { reason: dto.reason } : {}),
    ...(dto.rowCount !== undefined ? { rowCount: dto.rowCount } : {}),
    ...(dto.errorMessage !== undefined
      ? { errorMessage: dto.errorMessage }
      : {}),
    expiresAt: toIso(dto.expiresAt) ?? null,
    completedAt: toIso(dto.completedAt) ?? null,
    ...(dto.createdAt != null
      ? { createdAt: toIso(dto.createdAt) ?? undefined }
      : {}),
    ...(dto.downloadUrl ? { downloadUrl: dto.downloadUrl } : {}),
  };
}

/** Normalize audit search filters for query keys (no free-text PII). */
export function normalizeAdminAuditSearchFilters(
  filters: AdminAuditSearchFilters = {},
): AdminAuditSearchFilters {
  const limitRaw = filters.limit;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.trunc(limitRaw)))
      : 50;
  const out: AdminAuditSearchFilters = { limit };
  const action = auditOptionalString(filters.action);
  const resourceType = auditOptionalString(filters.resourceType);
  const resourceId = auditOptionalString(filters.resourceId);
  const actorUserId = auditOptionalString(filters.actorUserId);
  if (action) out.action = action;
  if (resourceType) out.resourceType = resourceType;
  if (resourceId) out.resourceId = resourceId;
  if (actorUserId) out.actorUserId = actorUserId;
  return out;
}

/** Wire → existing AdminStatus chrome (Published / Pending moderation / …). */
const ADMIN_REVIEW_STATUS_VIEW: Record<string, string> = {
  PUBLISHED: "Published",
  published: "Published",
  Published: "Published",
  PENDING: "Pending moderation",
  pending: "Pending moderation",
  "Pending moderation": "Pending moderation",
  NEEDS_EDIT: "Needs edit",
  needs_edit: "Needs edit",
  "Needs edit": "Needs edit",
  REMOVED: "Removed",
  removed: "Removed",
  Removed: "Removed",
};

/** BE ModerateReview allowlist: PUBLISHED|NEEDS_EDIT|REMOVED|PENDING. */
export type AdminReviewStatusWire =
  | "PUBLISHED"
  | "NEEDS_EDIT"
  | "REMOVED"
  | "PENDING";

export function humanizeAdminReviewStatus(raw: string): string {
  const s = raw.trim();
  return ADMIN_REVIEW_STATUS_VIEW[s] ?? s;
}

/** Map UI control status label → wire enum for POST …/transition. */
export function toAdminReviewStatusWire(
  displayOrWire: string,
): AdminReviewStatusWire | null {
  const s = displayOrWire.trim();
  switch (s) {
    case "PUBLISHED":
    case "Published":
      return "PUBLISHED";
    case "NEEDS_EDIT":
    case "Needs edit":
      return "NEEDS_EDIT";
    case "REMOVED":
    case "Removed":
      return "REMOVED";
    case "PENDING":
    case "Pending moderation":
      return "PENDING";
    default:
      return null;
  }
}

export function mapAdminReviewDto(dto: AdminReviewDto): AdminReview {
  return {
    id: dto.id,
    productId: dto.productId,
    product: dto.product,
    seller: dto.seller,
    buyer: dto.buyer,
    initials: dto.initials,
    rating: Math.max(0, Math.trunc(dto.rating)),
    title: dto.title,
    body: dto.body,
    verified: Boolean(dto.verified),
    status: humanizeAdminReviewStatus(dto.status),
    createdAt: dto.createdAt,
    ...(dto.sellerReply ? { sellerReply: dto.sellerReply } : {}),
  };
}

const FULFILLMENT_STATUSES: AdminFulfillmentStatus[] = [
  "Fulfilled",
  "Failed",
  "Pending",
  "Revoked",
];

/** Map BE grant/delivery status labels to existing UI tokens. */
export function mapAdminFulfillmentStatusDisplay(
  raw: string,
): AdminFulfillmentStatus {
  const s = raw.trim();
  if ((FULFILLMENT_STATUSES as string[]).includes(s)) {
    return s as AdminFulfillmentStatus;
  }
  switch (s.toUpperCase()) {
    case "ACTIVE":
    case "FULFILLED":
      return "Fulfilled";
    case "DELIVERY_FAILED":
    case "FAILED":
    case "EXPIRED":
      return "Failed";
    case "PENDING_FULFILLMENT":
    case "PENDING":
      return "Pending";
    case "REVOKED":
      return "Revoked";
    default:
      return "Pending";
  }
}

export function mapAdminFulfillmentDto(
  dto: AdminFulfillmentDto,
): AdminFulfillment {
  return {
    id: dto.id,
    order: dto.order,
    merchant: dto.merchant,
    type: dto.type,
    target: dto.target,
    status: mapAdminFulfillmentStatusDisplay(dto.status),
    attempts: nonNegInt(dto.attempts),
    time: dto.time,
  };
}

export function mapAdminDeliveryGrantCommandResult(
  dto: AdminDeliveryGrantDto,
  requestId: string,
): AdminFulfillmentCommandResult {
  return {
    grantId: dto.id,
    orderId: dto.orderId,
    status: dto.status,
    requestId,
  };
}

/**
 * ADM-320 — privileged reveal → component-local secret only.
 * Never put result in React Query cache.
 */
export function mapAdminInventoryRevealDto(
  dto: InventoryRevealDto,
  expiresAt?: string,
): AdminStockItemSecret {
  return {
    itemId: dto.itemId,
    values: { ...dto.secrets },
    expiresAt:
      expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
  };
}

/** Runtime guard: redacted inventory list must not carry secret bags. */
export function assertNoSecretsInAdminInventory(
  snapshot: {
    products: unknown[];
    items: AdminStockItem[];
    schema: unknown[];
  },
): void {
  for (const item of snapshot.items) {
    const rec = item as unknown as Record<string, unknown>;
    if ("values" in rec && rec.values != null) {
      throw new Error(
        `Admin inventory item ${item.id} must not include values`,
      );
    }
    if ("secrets" in rec && rec.secrets != null) {
      throw new Error(
        `Admin inventory item ${item.id} must not include secrets`,
      );
    }
    if ("encryptedPayload" in rec || "encrypted_payload" in rec) {
      throw new Error(
        `Admin inventory item ${item.id} must not include ciphertext`,
      );
    }
  }
  const blob = JSON.stringify(snapshot).toLowerCase();
  for (const key of [
    '"secrets"',
    '"encryptedpayload"',
    '"encrypted_payload"',
    "fsk_live_",
    "fsk_test_",
  ]) {
    if (blob.includes(key)) {
      throw new Error(
        `Admin inventory snapshot must not include secret material (${key})`,
      );
    }
  }
}

export function mapAdminInventorySnapshotDto(
  dto: AdminInventorySnapshotDto,
) {
  const snapshot = {
    products: dto.products.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      available: nonNegInt(p.available),
      reserved: nonNegInt(p.reserved),
      sold: nonNegInt(p.sold),
      invalid: nonNegInt(p.invalid),
      lowAt: nonNegInt(p.lowAt),
      delivery: p.delivery,
    })),
    items: dto.items.map((item) => ({
      id: item.id,
      schemaPreview: item.schemaPreview,
      status: (["Available", "Reserved", "Sold", "Invalid"].includes(
        item.status,
      )
        ? item.status
        : "Available") as "Available" | "Reserved" | "Sold" | "Invalid",
      ...(item.orderId ? { orderId: item.orderId } : {}),
      createdAt: item.createdAt,
    })),
    schema: dto.schema.map((f) => ({
      key: f.key,
      label: f.label,
      secret: Boolean(f.secret),
      required: Boolean(f.required),
      buyerCopyable: Boolean(f.buyerCopyable),
    })),
  };
  assertNoSecretsInAdminInventory(snapshot);
  return snapshot;
}

export function mapAdminListPage<TDto, TView>(
  items: TDto[],
  meta: AdminBoundedListMeta,
  mapItem: (dto: TDto) => TView,
): AdminBoundedList<TView> {
  return {
    items: items.map(mapItem),
    hasMore: Boolean(meta.hasMore),
    nextCursor: meta.nextCursor ?? null,
    asOf: meta.timestamp,
    ...(meta.page !== undefined ? { page: meta.page } : {}),
    ...(meta.pageSize !== undefined ? { pageSize: meta.pageSize } : {}),
    ...(meta.totalCount !== undefined
      ? { totalCount: nonNegInt(meta.totalCount) }
      : {}),
    ...(meta.pageCount !== undefined
      ? { pageCount: nonNegInt(meta.pageCount) }
      : {}),
  };
}

/** Normalize list filters for query keys + wire (stable empty object). */
export function normalizeAdminListFilters(
  filters: AdminListFilters = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const q = filters.q?.trim();
  if (q) out.q = q;
  if (filters.status?.trim()) out.status = filters.status.trim();
  if (filters.source?.trim()) out.source = filters.source.trim();
  if (filters.cursor?.trim()) out.cursor = filters.cursor.trim();
  if (filters.limit !== undefined && filters.limit !== null) {
    out.limit = Math.min(100, Math.max(1, Math.trunc(filters.limit) || 50));
  }
  if (filters.page !== undefined && filters.page !== null) {
    out.page = Math.max(1, Math.trunc(filters.page) || 1);
  }
  if (filters.pageSize !== undefined && filters.pageSize !== null) {
    out.pageSize = Math.min(
      100,
      Math.max(1, Math.trunc(filters.pageSize) || 50),
    );
  }
  if (filters.from) out.from = filters.from;
  if (filters.to) out.to = filters.to;
  return out;
}

export function adminListQueryParams(
  filters: AdminListFilters = {},
): Record<string, string | number | undefined> {
  const n = normalizeAdminListFilters(filters);
  return {
    q: typeof n.q === "string" ? n.q : undefined,
    status: typeof n.status === "string" ? n.status : undefined,
    source: typeof n.source === "string" ? n.source : undefined,
    cursor: typeof n.cursor === "string" ? n.cursor : undefined,
    limit: typeof n.limit === "number" ? n.limit : undefined,
    page: typeof n.page === "number" ? n.page : undefined,
    pageSize: typeof n.pageSize === "number" ? n.pageSize : undefined,
    from: typeof n.from === "string" ? n.from : undefined,
    to: typeof n.to === "string" ? n.to : undefined,
  };
}

/** Metric display helpers for overview cards (server values only). */
export function overviewMetricLabels(overview: AdminOverview): {
  grossVolume: string;
  platformRevenue: string;
  paymentSuccess: string;
  pendingWithdrawals: string;
} {
  return {
    grossVolume: compactRupiah(overview.grossVolumePaidIdr),
    platformRevenue: compactRupiah(overview.platformFeePaidIdr),
    paymentSuccess: formatSuccessRateBps(overview.paymentSuccessRateBps),
    pendingWithdrawals: formatCountId(overview.pendingWithdrawalCount),
  };
}

/** Presentational role color — never from backend. */
const ROLE_COLOR_PALETTE = [
  "#5b7cfa",
  "#28a566",
  "#e59633",
  "#9a6de2",
  "#738099",
  "#4f6fe1",
  "#c6534c",
  "#31875a",
] as const;

export function mapAdminRoleColor(idOrCode: string): string {
  let hash = 0;
  for (let i = 0; i < idOrCode.length; i += 1) {
    hash = (hash * 31 + idOrCode.charCodeAt(i)) >>> 0;
  }
  return ROLE_COLOR_PALETTE[hash % ROLE_COLOR_PALETTE.length]!;
}

/** ADM-220 — BE RoleDTO → existing AdminRole chrome. */
export function mapAdminRoleDto(dto: AdminRoleDto): AdminRole {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? "",
    permissions: [...(dto.permissions ?? [])].sort(),
    members: 0,
    system: Boolean(dto.isSystem),
    color: mapAdminRoleColor(dto.code || dto.id),
    version: dto.version,
    code: dto.code,
    archivedAt: dto.archivedAt ?? null,
  };
}

/** Flat permission registry → grouped AdminPermissionGroup presentation. */
export function mapPermissionRegistryToGroups(
  items: AdminPermissionRegistryItemDto[],
): AdminPermissionGroup[] {
  const byCategory = new Map<string, Array<[string, string]>>();
  for (const item of items) {
    const group = item.category?.trim() || "Platform";
    const list = byCategory.get(group) ?? [];
    list.push([item.code, item.description ?? ""]);
    byCategory.set(group, list);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, permissions]) => ({
      group,
      permissions: permissions.sort(([a], [b]) => a.localeCompare(b)),
    }));
}

export function mapAdminUserLookupDto(dto: AdminUserLookupDto): AdminUserLookup {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    status: dto.status,
    isAdmin: Boolean(dto.isAdmin),
    ownerMerchantId: dto.ownerMerchantId ?? null,
    impersonatable: Boolean(dto.impersonatable),
    createdAt: dto.createdAt ?? "",
  };
}

export function mapAdminUserRoleAssignmentDto(
  dto: AdminUserRoleAssignmentDto,
): AdminUserRoleAssignment {
  return {
    userId: dto.userId,
    roleId: dto.roleId,
    roleCode: dto.roleCode ?? "",
    roleName: dto.roleName ?? "",
    isSystem: Boolean(dto.isSystem),
    assignedAt: dto.assignedAt ?? "",
    assignedBy: dto.assignedBy,
  };
}

/**
 * List invitation DTO → view model. Token must never appear on list items;
 * create response token is stripped before caching.
 */
export function mapAdminStaffInvitationDto(
  dto: AdminStaffInvitationDto,
): AdminStaffInvitation {
  return {
    id: dto.id,
    email: dto.email,
    roleId: dto.roleId,
    status: dto.status,
    expiresAt: dto.expiresAt ?? "",
    createdAt: dto.createdAt ?? "",
  };
}

/** Compose users-screen staff row from lookup (+ optional role labels). */
export function mapAdminStaffMember(
  user: AdminUserLookup,
  roleNames: string[] = [],
): AdminStaffMember {
  const statusRaw = user.status?.trim() || "Active";
  const status =
    statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleLabel: roleNames.filter(Boolean).join(", ") || (user.isAdmin ? "Staff" : "User"),
    status,
    lastActive: user.createdAt || "—",
    mfaEnabled: user.isAdmin,
    isAdmin: user.isAdmin,
  };
}

/** Stable role code for create from display name (custom roles). */
export function slugifyRoleCode(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base.length >= 2 ? base : `CUSTOM_${Date.now().toString(36).toUpperCase()}`;
}
