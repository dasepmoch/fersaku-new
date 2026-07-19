/**
 * Coupon transport DTO → existing list/form view (SEL-280 / UI-040).
 * Money remains integer IDR; UI never decrements usage as authority.
 */

import { rupiah } from "@/shared/format/money";
import type { CouponDto } from "@/shared/api/schemas";
import type {
  CreateSellerCouponInput,
  PatchSellerCouponInput,
  SellerCoupon,
  SellerCouponListMetrics,
} from "./contracts";
import type {
  CouponCreateRequest,
  CouponPatchRequest,
} from "@/shared/api/schemas";

const STATE_VIEW: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};

export function mapCouponStateToStatus(state: string): string {
  return STATE_VIEW[state] ?? state;
}

export function formatCouponEndsAt(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return value;
  }
}

/** Discount column: `20%` or `Rp50.000` from server integers only. */
export function formatCouponDiscountLabel(dto: {
  discountKind: string;
  discountValue: number;
  discountPercent?: number;
}): string {
  if (dto.discountKind === "PERCENT") {
    if (
      dto.discountPercent != null &&
      Number.isFinite(dto.discountPercent) &&
      dto.discountPercent > 0
    ) {
      return `${Math.trunc(dto.discountPercent)}%`;
    }
    const bps = Number.isFinite(dto.discountValue)
      ? Math.trunc(dto.discountValue)
      : 0;
    if (bps % 100 === 0) return `${bps / 100}%`;
    return `${(bps / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
  }
  const idr = Number.isFinite(dto.discountValue)
    ? Math.trunc(dto.discountValue)
    : 0;
  return rupiah(idr);
}

/** Usage column: `128 / 250` or `42` when unlimited. */
export function formatCouponUsageLabel(
  usageCount: number,
  maxTotalUses?: number,
): string {
  const used = Number.isFinite(usageCount) ? Math.max(0, Math.trunc(usageCount)) : 0;
  if (maxTotalUses != null && Number.isFinite(maxTotalUses) && maxTotalUses > 0) {
    return `${used} / ${Math.trunc(maxTotalUses)}`;
  }
  return String(used);
}

export function mapCouponDto(dto: CouponDto): SellerCoupon {
  const reserved = Math.max(0, Math.trunc(dto.reservedCount ?? 0));
  const redeemed = Math.max(0, Math.trunc(dto.redeemedCount ?? 0));
  const usage =
    dto.usageCount != null && Number.isFinite(dto.usageCount)
      ? Math.max(0, Math.trunc(dto.usageCount))
      : reserved + redeemed;

  return {
    id: dto.id,
    storeId: dto.storeId,
    code: dto.code,
    discountKind: dto.discountKind,
    discountValue: Math.trunc(dto.discountValue),
    discountLabel: formatCouponDiscountLabel(dto),
    usageLabel: formatCouponUsageLabel(usage, dto.maxTotalUses),
    endsAtLabel: formatCouponEndsAt(dto.endsAt),
    status: mapCouponStateToStatus(dto.state),
    state: dto.state,
    scope: dto.scope,
    version: dto.version,
    policyVersion: dto.policyVersion,
    reservedCount: reserved,
    redeemedCount: redeemed,
    usageCount: usage,
    maxTotalUses: dto.maxTotalUses,
    maxPerCustomerUses: dto.maxPerCustomerUses,
    minMerchandise: dto.minMerchandise,
    startsAt: dto.startsAt,
    endsAt: dto.endsAt,
    productIds: dto.productIds ?? [],
  };
}

export function mapCouponListDto(items: CouponDto[]): SellerCoupon[] {
  return items.map(mapCouponDto);
}

/** List row tuple matching existing table cells [code, discount, usage, ends, status]. */
export function couponToTableRow(
  c: SellerCoupon,
): [string, string, string, string, string] {
  return [c.code, c.discountLabel, c.usageLabel, c.endsAtLabel, c.status];
}

export function computeCouponListMetrics(
  items: SellerCoupon[],
): SellerCouponListMetrics {
  const totalCount = items.length;
  const activeCount = items.filter((c) => c.state === "ACTIVE").length;
  const ordersWithCoupon = items.reduce((sum, c) => sum + c.usageCount, 0);
  return {
    activeCount,
    totalCount,
    ordersWithCoupon,
    totalDiscountLabel: "—",
  };
}

function normalizeDiscountKind(
  kind: string,
): "PERCENT" | "FIXED_IDR" {
  const k = kind.trim().toLowerCase();
  if (k === "percent" || k === "percentage") return "PERCENT";
  if (k === "fixed" || k === "fixed_idr") return "FIXED_IDR";
  if (kind === "PERCENT" || kind === "FIXED_IDR") return kind;
  return "PERCENT";
}

function normalizeScope(scope?: string): string | undefined {
  if (!scope) return undefined;
  const s = scope.trim().toLowerCase();
  if (s === "all" || s === "all_products" || s === "semua produk") {
    return "ALL_PRODUCTS";
  }
  if (
    s === "selected" ||
    s === "selected_products" ||
    s === "produk tertentu"
  ) {
    return "SELECTED_PRODUCTS";
  }
  if (scope === "ALL_PRODUCTS" || scope === "SELECTED_PRODUCTS") return scope;
  return scope;
}

/** Parse loose endsAt form input (`31 Jul 2026` or ISO) → RFC3339 when possible. */
export function parseCouponEndsAtInput(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t.includes("T") ? t : `${t}T23:59:59Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return t;
}

export function toCreateCouponRequestBody(
  input: CreateSellerCouponInput,
): CouponCreateRequest {
  const discountKind = normalizeDiscountKind(input.discountKind);
  const body: CouponCreateRequest = {
    code: input.code.trim().toUpperCase(),
    discountKind,
    discountValue: Math.trunc(input.discountValue),
  };
  if (input.percentIsBps != null) body.percentIsBps = input.percentIsBps;
  if (input.minMerchandise != null && input.minMerchandise > 0) {
    body.minMerchandise = Math.trunc(input.minMerchandise);
  }
  if (input.maxTotalUses != null && input.maxTotalUses > 0) {
    body.maxTotalUses = Math.trunc(input.maxTotalUses);
  }
  if (input.maxPerCustomerUses != null && input.maxPerCustomerUses > 0) {
    body.maxPerCustomerUses = Math.trunc(input.maxPerCustomerUses);
  }
  if (input.startsAt) body.startsAt = input.startsAt;
  if (input.endsAt) body.endsAt = input.endsAt;
  const scope = normalizeScope(input.scope);
  if (scope) body.scope = scope;
  if (input.productIds?.length) body.productIds = input.productIds;
  return body;
}

export function toPatchCouponRequestBody(
  input: PatchSellerCouponInput,
): CouponPatchRequest {
  const body: CouponPatchRequest = {
    expectedVersion: input.expectedVersion,
  };
  if (input.code != null) body.code = input.code.trim().toUpperCase();
  if (input.discountKind != null) {
    body.discountKind = normalizeDiscountKind(input.discountKind);
  }
  if (input.discountValue != null) {
    body.discountValue = Math.trunc(input.discountValue);
  }
  if (input.percentIsBps != null) body.percentIsBps = input.percentIsBps;
  if (input.minMerchandise != null) {
    body.minMerchandise = Math.trunc(input.minMerchandise);
  }
  if (input.maxTotalUses != null) {
    body.maxTotalUses = Math.trunc(input.maxTotalUses);
  }
  if (input.clearMaxTotalUses) body.clearMaxTotalUses = true;
  if (input.maxPerCustomerUses != null) {
    body.maxPerCustomerUses = Math.trunc(input.maxPerCustomerUses);
  }
  if (input.clearMaxPerCustomerUses) body.clearMaxPerCustomerUses = true;
  if (input.startsAt != null) body.startsAt = input.startsAt;
  if (input.clearStartsAt) body.clearStartsAt = true;
  if (input.endsAt != null) body.endsAt = input.endsAt;
  if (input.clearEndsAt) body.clearEndsAt = true;
  if (input.scope != null) body.scope = normalizeScope(input.scope) ?? input.scope;
  if (input.productIds != null) body.productIds = input.productIds;
  return body;
}

/** Table row key: prefer server id; fall back to code for mock tuples. */
export function couponRowKey(
  row: SellerCoupon | [string, string, string, string, string],
): string {
  if (Array.isArray(row)) return row[0];
  return row.id || row.code;
}
