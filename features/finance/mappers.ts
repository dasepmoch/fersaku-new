/**
 * SEL-400 — finance transport DTO → existing balance/ledger/revenue view models.
 * Pure; no React. Money is server-authoritative integer IDR — never recompute.
 */

import type {
  FinanceLedgerItemDto,
  FinanceLedgerPageDto,
  FinanceRevenuePointDto,
  FinanceSummaryDto,
  FinanceSourceWireDto,
} from "@/shared/api/schemas";
import { requireSafeMoneyIdr } from "@/shared/api/mappers";
import type { CursorPage } from "@/shared/api/contracts";
import type { FinanceSource } from "@/shared/finance/source-badge";
import type {
  SellerFinanceSummary,
  SellerLedgerItem,
  SellerLedgerType,
  SellerRevenuePoint,
} from "./contracts";

const EMPTY_SOURCE = { availableAmount: 0, pendingAmount: 0 } as const;

function money(value: number, field: string): number {
  return requireSafeMoneyIdr(value, field);
}

/** Wire source → UI badge source (SYSTEM presents as MIXED for existing chrome). */
export function mapFinanceSourceToView(
  source: FinanceSourceWireDto | string,
): FinanceSource {
  const u = String(source).trim().toUpperCase();
  if (u === "STOREFRONT") return "STOREFRONT";
  if (u === "QRIS_API") return "QRIS_API";
  if (u === "MIXED" || u === "SYSTEM") return "MIXED";
  return "MIXED";
}

/** Exhaustive ledger type passthrough including SETTLEMENT_RELEASE. */
export function mapFinanceLedgerType(type: string): SellerLedgerType {
  const u = String(type).trim().toUpperCase();
  switch (u) {
    case "SALE":
      return "SALE";
    case "PLATFORM_FEE":
      return "PLATFORM_FEE";
    case "PROVIDER_FEE":
      return "PROVIDER_FEE";
    case "WITHDRAWAL":
      return "WITHDRAWAL";
    case "ADJUSTMENT":
      return "ADJUSTMENT";
    case "SETTLEMENT_RELEASE":
      return "SETTLEMENT_RELEASE";
    default:
      return "ADJUSTMENT";
  }
}

function sourceBucket(
  sources: FinanceSummaryDto["sources"],
  key: "STOREFRONT" | "QRIS_API",
): { availableAmount: number; pendingAmount: number } {
  const raw = sources[key];
  if (!raw) return { ...EMPTY_SOURCE };
  return {
    availableAmount: money(raw.availableAmount, `sources.${key}.availableAmount`),
    pendingAmount: money(raw.pendingAmount, `sources.${key}.pendingAmount`),
  };
}

/**
 * Map finance summary DTO → view model.
 * Does not derive net/balance from fee components — uses server monthNetAmount as-is.
 */
export function mapFinanceSummaryDto(
  dto: FinanceSummaryDto,
  asOfFallback?: string,
): SellerFinanceSummary {
  return {
    storeId: dto.storeId,
    availableAmount: money(dto.availableAmount, "availableAmount"),
    pendingAmount: money(dto.pendingAmount, "pendingAmount"),
    heldAmount: money(dto.heldAmount, "heldAmount"),
    lifetimeGrossAmount: money(
      dto.lifetimeGrossAmount ?? 0,
      "lifetimeGrossAmount",
    ),
    monthGrossAmount: money(dto.monthGrossAmount ?? 0, "monthGrossAmount"),
    monthPlatformFeeAmount: money(
      dto.monthPlatformFeeAmount ?? 0,
      "monthPlatformFeeAmount",
    ),
    monthProviderFeeAmount: money(
      dto.monthProviderFeeAmount ?? 0,
      "monthProviderFeeAmount",
    ),
    monthNetAmount: money(dto.monthNetAmount ?? 0, "monthNetAmount"),
    sources: {
      STOREFRONT: sourceBucket(dto.sources, "STOREFRONT"),
      QRIS_API: sourceBucket(dto.sources, "QRIS_API"),
    },
    currency: "IDR",
    asOf: dto.asOf || asOfFallback || "",
    ...(dto.feePolicy
      ? {
          feePolicy: {
            transactionPercentBps: dto.feePolicy.transactionPercentBps ?? 0,
            transactionFixedIdr: money(
              dto.feePolicy.transactionFixedIdr ?? 0,
              "feePolicy.transactionFixedIdr",
            ),
            withdrawalPercentBps: dto.feePolicy.withdrawalPercentBps ?? 0,
            minimumWithdrawalIdr: money(
              dto.feePolicy.minimumWithdrawalIdr ?? 0,
              "feePolicy.minimumWithdrawalIdr",
            ),
          },
        }
      : {}),
    ...(dto.withdrawalAllocationPolicy
      ? { withdrawalAllocationPolicy: dto.withdrawalAllocationPolicy }
      : {}),
  };
}

export function emptyFinanceSummary(
  storeId: string,
  asOf: string,
): SellerFinanceSummary {
  return {
    storeId,
    availableAmount: 0,
    pendingAmount: 0,
    heldAmount: 0,
    lifetimeGrossAmount: 0,
    monthGrossAmount: 0,
    monthPlatformFeeAmount: 0,
    monthProviderFeeAmount: 0,
    monthNetAmount: 0,
    sources: {
      STOREFRONT: { ...EMPTY_SOURCE },
      QRIS_API: { ...EMPTY_SOURCE },
    },
    currency: "IDR",
    asOf,
  };
}

export function mapFinanceRevenuePointDto(
  dto: FinanceRevenuePointDto,
): SellerRevenuePoint {
  return {
    day: dto.day,
    revenue: money(dto.revenue, "revenue"),
    orders: Math.max(0, Math.trunc(dto.orders)),
  };
}

export function mapFinanceRevenueDto(
  points: FinanceRevenuePointDto[],
): SellerRevenuePoint[] {
  return points.map(mapFinanceRevenuePointDto);
}

export function mapFinanceLedgerItemDto(
  dto: FinanceLedgerItemDto,
): SellerLedgerItem {
  return {
    id: dto.id,
    storeId: dto.storeId,
    type: mapFinanceLedgerType(dto.type),
    description: dto.description?.trim() || dto.type,
    amount: money(dto.amount, "amount"),
    direction: dto.direction,
    source: mapFinanceSourceToView(dto.source),
    occurredAt: dto.occurredAt,
    ...(dto.orderId ? { orderId: dto.orderId } : {}),
    ...(dto.withdrawalId ? { withdrawalId: dto.withdrawalId } : {}),
  };
}

/** Normalize backend FinanceLedgerPage → existing CursorPage UI shape. */
export function mapFinanceLedgerPageDto(
  page: FinanceLedgerPageDto,
): CursorPage<SellerLedgerItem> {
  return {
    items: page.items.map(mapFinanceLedgerItemDto),
    nextCursor: page.nextCursor ?? null,
    previousCursor: page.previousCursor ?? null,
    hasMore: page.hasMore,
  };
}

export function emptyFinanceLedgerPage(): CursorPage<SellerLedgerItem> {
  return {
    items: [],
    nextCursor: null,
    previousCursor: null,
    hasMore: false,
  };
}
