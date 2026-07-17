/**
 * ADM-120 — admin read DTO → existing view models.
 * Pure; no React. Money/aggregates stay server-authoritative.
 */

import { compactRupiah } from "@/shared/format/money";
import type {
  AdminAuditEventDto,
  AdminBuyerDto,
  AdminMerchantDto,
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
  AdminMerchant,
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
