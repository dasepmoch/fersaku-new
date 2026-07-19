/**
 * SEL-400 / SEL-410 — finance + withdrawal transport DTO → existing view models.
 * Pure; no React. Money is server-authoritative integer IDR — never recompute.
 */

import type {
  FinanceLedgerItemDto,
  FinanceLedgerPageDto,
  FinanceRevenuePointDto,
  FinanceSummaryDto,
  FinanceSourceWireDto,
  WithdrawalDto,
  WithdrawalLockDto,
  WithdrawalQuoteDto,
} from "@/shared/api/schemas";
import { invalidApiContract, requireSafeMoneyIdr } from "@/shared/api/mappers";
import type { CursorPage } from "@/shared/api/contracts";
import type { FinanceSource } from "@/shared/finance/source-badge";
import type {
  SellerFinanceSummary,
  SellerLedgerItem,
  SellerLedgerType,
  SellerRevenuePoint,
  SellerWithdrawal,
  SellerWithdrawalLock,
  SellerWithdrawalQuote,
  SellerWithdrawalStatus,
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
    availableAmount: money(
      raw.availableAmount,
      `sources.${key}.availableAmount`,
    ),
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

// --- SEL-410 withdrawal quote / list / lock ---

/** Last 4 digits from masked bank display (•••• 4821). */
export function last4FromBankMask(masked: string | undefined): string {
  if (!masked) return "";
  const digits = masked.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return digits;
}

/** Bank label for existing history/form chrome: `BCA • 4821`. */
export function formatWithdrawalBankLabel(
  bankCode: string | undefined,
  masked: string | undefined,
): string {
  const code = (bankCode || "BANK").trim().toUpperCase() || "BANK";
  const last4 = last4FromBankMask(masked);
  return last4 ? `${code} • ${last4}` : code;
}

/**
 * Wire domain status → existing StatusBadge labels.
 * REQUESTED/UNDER_REVIEW → Pending; PROCESSING/APPROVED/HELD/UNKNOWN → Processing;
 * COMPLETED → Completed; FAILED/REJECTED/CANCELLED → Failed.
 */
export function mapWithdrawalStatusToView(
  status: string,
): SellerWithdrawalStatus {
  const u = String(status).trim().toUpperCase();
  switch (u) {
    case "COMPLETED":
      return "Completed";
    case "FAILED":
    case "REJECTED":
    case "CANCELLED":
      return "Failed";
    case "PROCESSING":
    case "APPROVED":
    case "HELD":
    case "UNKNOWN_OUTCOME":
    case "UNKNOWN":
      return "Processing";
    case "REQUESTED":
    case "UNDER_REVIEW":
    case "PENDING":
      return "Pending";
    default:
      return "Pending";
  }
}

/** Display date for history table (id-ID, Asia/Jakarta). */
export function formatWithdrawalRequestedAt(
  createdAt: string,
  nowMs: number = Date.now(),
): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt || "—";
  const diff = nowMs - d.getTime();
  if (diff >= 0 && diff < 120_000) return "baru saja";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Map quote DTO → form view. ACTIVE (and mock VERIFIED) are quotable.
 * Money fields pass through server integers only.
 */
export function mapWithdrawalQuoteDto(
  dto: WithdrawalQuoteDto,
  storeId: string,
  bankAccountIdFallback?: string,
): SellerWithdrawalQuote {
  const id = dto.quoteId.trim();
  if (!id) {
    return invalidApiContract("Withdrawal quote missing quoteId", {
      issues: [{ path: "quoteId", message: "empty" }],
    });
  }
  const wireStatus = String(dto.status ?? "ACTIVE")
    .trim()
    .toUpperCase();
  if (wireStatus !== "ACTIVE" && wireStatus !== "VERIFIED") {
    return invalidApiContract("Withdrawal quote is not active", {
      issues: [{ path: "status", message: wireStatus }],
    });
  }
  const bankAccountId = (
    dto.bankAccountId ||
    bankAccountIdFallback ||
    ""
  ).trim();
  if (!bankAccountId) {
    return invalidApiContract("Withdrawal quote missing bankAccountId", {
      issues: [{ path: "bankAccountId", message: "empty" }],
    });
  }
  return {
    id,
    storeId,
    bankAccountId,
    amount: money(dto.amountDebited, "amountDebited"),
    platformFee: money(dto.platformFee, "platformFee"),
    providerProcessingFee: money(
      dto.providerProcessingFee,
      "providerProcessingFee",
    ),
    totalFee: money(dto.totalFee, "totalFee"),
    netAmount: money(dto.netDisbursement, "netDisbursement"),
    provider: "Xendit",
    status: "VERIFIED",
    expiresAt:
      typeof dto.expiresAt === "string" ? dto.expiresAt : String(dto.expiresAt),
    ...(dto.minimumAmount != null
      ? { minimumAmount: money(dto.minimumAmount, "minimumAmount") }
      : {}),
    ...(dto.policyVersion ? { policyVersion: dto.policyVersion } : {}),
  };
}

export function mapWithdrawalDto(
  dto: WithdrawalDto,
  storeId: string,
  nowMs?: number,
): SellerWithdrawal {
  const id = dto.id.trim();
  if (!id) {
    return invalidApiContract("Withdrawal missing id", {
      issues: [{ path: "id", message: "empty" }],
    });
  }
  return {
    id,
    storeId,
    amount: money(dto.amountDebited, "amountDebited"),
    bankLabel: formatWithdrawalBankLabel(dto.bankCode, dto.bankAccountMasked),
    status: mapWithdrawalStatusToView(dto.status),
    requestedAt: formatWithdrawalRequestedAt(
      typeof dto.createdAt === "string" ? dto.createdAt : String(dto.createdAt),
      nowMs,
    ),
    source: mapFinanceSourceToView(dto.source ?? "MIXED"),
  };
}

export function mapWithdrawalListDto(
  items: WithdrawalDto[],
  storeId: string,
  nowMs?: number,
): SellerWithdrawal[] {
  return items.map((item) => mapWithdrawalDto(item, storeId, nowMs));
}

/** Human remaining lock window for existing lock banner. */
export function formatWithdrawalLockRemaining(
  lockedUntil: string,
  nowMs: number = Date.now(),
): string | null {
  const end = new Date(lockedUntil).getTime();
  if (!Number.isFinite(end) || end <= nowMs) return null;
  const ms = end - nowMs;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours} jam`;
  const days = Math.ceil(hours / 24);
  return `${days} hari`;
}

/**
 * Map lock DTO → view. lockedUntil → unlockedAt (existing chrome name).
 * reason → reasonCode BANK_ACCOUNT_CHANGED when applicable.
 */
export function mapWithdrawalLockDto(
  dto: WithdrawalLockDto,
  nowMs: number = Date.now(),
): SellerWithdrawalLock {
  const locked = Boolean(dto.locked);
  const lockedUntil =
    dto.lockedUntil != null && String(dto.lockedUntil).trim()
      ? String(dto.lockedUntil)
      : null;
  const active =
    locked && lockedUntil != null && new Date(lockedUntil).getTime() > nowMs;
  const reasonRaw = dto.reason != null ? String(dto.reason).trim() : "";
  const reasonUpper = reasonRaw.toUpperCase();
  const reasonCode =
    active &&
    (reasonUpper === "BANK_ACCOUNT_CHANGED" ||
      reasonUpper.includes("BANK") ||
      reasonRaw.length > 0)
      ? ("BANK_ACCOUNT_CHANGED" as const)
      : null;
  return {
    locked: active,
    reasonCode: active ? reasonCode : null,
    unlockedAt: active ? lockedUntil : null,
    remainingLabel:
      active && lockedUntil
        ? formatWithdrawalLockRemaining(lockedUntil, nowMs)
        : null,
  };
}

/** True when quote is still within server expiresAt (client clock). */
export function isSellerWithdrawalQuoteFresh(
  quote: SellerWithdrawalQuote | null | undefined,
  now: number | Date = Date.now(),
): boolean {
  if (!quote || quote.status !== "VERIFIED") return false;
  const current = now instanceof Date ? now.getTime() : now;
  const exp = new Date(quote.expiresAt).getTime();
  return Number.isFinite(exp) && exp > current;
}
