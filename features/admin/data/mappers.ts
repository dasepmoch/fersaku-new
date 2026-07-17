/**
 * ADM-120 — admin read DTO → existing view models.
 * Pure; no React. Money/aggregates stay server-authoritative.
 */

import { compactRupiah } from "@/shared/format/money";
import type {
  AdminAuditEventDto,
  AdminBuyerDto,
  AdminBuyerPurchaseDto,
  AdminBuyerSessionDto,
  AdminMaskedCredentialDto,
  AdminMerchantDto,
  AdminMerchantFinanceSummaryDto,
  AdminOrderDto,
  AdminOverviewDto,
  AdminPaymentDto,
  AdminReviewDto,
  AdminWithdrawalDto,
  AdminBoundedListMeta,
  AdminInventorySnapshotDto,
} from "@/shared/api/schemas";
import type {
  AdminAuditEvent,
  AdminBuyer,
  AdminBuyerPurchase,
  AdminBuyerSession,
  AdminMaskedCredential,
  AdminMerchant,
  AdminMerchantApiAccessWire,
  AdminMerchantFinanceSummary,
  AdminMerchantStatusWire,
  AdminOrder,
  AdminPaymentIntent,
  AdminPaymentSource,
  AdminReview,
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
    status: dto.status,
    payment: dto.payment,
    created: dto.created,
    source: "STOREFRONT",
  };
}

export function mapAdminPaymentDto(dto: AdminPaymentDto): AdminPaymentIntent {
  return {
    id: dto.id,
    provider: dto.provider,
    merchant: dto.merchant,
    amount: nonNegMoney(dto.amount),
    providerRef: dto.providerRef,
    status: dto.status,
    latency: dto.latency,
    created: dto.created,
    source: mapPaymentSource(dto.source),
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

export function mapAdminAuditEventDto(
  dto: AdminAuditEventDto,
): AdminAuditEvent {
  return {
    id: dto.id,
    actor: dto.actor,
    action: dto.action,
    target: dto.target,
    ip: dto.ip,
    result: dto.result,
    time: dto.time,
    ...(dto.context ? { context: dto.context } : {}),
    ...(dto.previousHash ? { previousHash: dto.previousHash } : {}),
    ...(dto.integrityHash ? { integrityHash: dto.integrityHash } : {}),
  };
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
    status: dto.status,
    createdAt: dto.createdAt,
    ...(dto.sellerReply ? { sellerReply: dto.sellerReply } : {}),
  };
}

export function mapAdminInventorySnapshotDto(
  dto: AdminInventorySnapshotDto,
) {
  return {
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
