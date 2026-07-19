import type { FinanceSource } from "@/shared/finance/source-badge";

/** Server-authoritative finance summary (integer IDR). Never recompute in UI. */
export type SellerFinanceSummary = {
  storeId: string;
  availableAmount: number;
  pendingAmount: number;
  heldAmount: number;
  lifetimeGrossAmount: number;
  monthGrossAmount: number;
  monthPlatformFeeAmount: number;
  monthProviderFeeAmount: number;
  monthNetAmount: number;
  sources: Record<
    Exclude<FinanceSource, "MIXED">,
    { availableAmount: number; pendingAmount: number }
  >;
  currency: "IDR";
  asOf: string;
  feePolicy?: {
    transactionPercentBps: number;
    transactionFixedIdr: number;
    withdrawalPercentBps: number;
    minimumWithdrawalIdr: number;
  };
  withdrawalAllocationPolicy?: string;
};

/** Includes SETTLEMENT_RELEASE (SEL-400 exhaustive handling). */
export type SellerLedgerType =
  | "SALE"
  | "PLATFORM_FEE"
  | "PROVIDER_FEE"
  | "WITHDRAWAL"
  | "ADJUSTMENT"
  | "SETTLEMENT_RELEASE";

export type SellerLedgerItem = {
  id: string;
  storeId: string;
  type: SellerLedgerType;
  description: string;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  source: FinanceSource;
  occurredAt: string;
  orderId?: string;
  withdrawalId?: string;
};

export type SellerWithdrawalStatus =
  "Pending" | "Completed" | "Processing" | "Failed";

export type SellerWithdrawal = {
  id: string;
  storeId: string;
  amount: number;
  bankLabel: string;
  status: SellerWithdrawalStatus;
  requestedAt: string;
  source: FinanceSource;
};

export type SellerWithdrawalLock = {
  locked: boolean;
  reasonCode: "BANK_ACCOUNT_CHANGED" | null;
  unlockedAt: string | null;
  remainingLabel: string | null;
};

/**
 * Server quote mapped for existing form chrome.
 * status VERIFIED = wire ACTIVE (quotable); money fields are server integers.
 */
export type SellerWithdrawalQuote = {
  id: string;
  storeId: string;
  bankAccountId: string;
  amount: number;
  platformFee: number;
  providerProcessingFee: number;
  totalFee: number;
  netAmount: number;
  provider: "Xendit";
  status: "VERIFIED";
  expiresAt: string;
  minimumAmount?: number;
  policyVersion?: string;
};

export type RequestSellerWithdrawalQuoteInput = {
  storeId: string;
  bankAccountId: string;
  amount: number;
  /** Stable UUID per quote intent; omit to mint once in adapter. */
  idempotencyKey?: string;
};

/**
 * Create withdrawal — MFA via X-Recent-MFA-Proof (INT-140), never body reauthProof.
 * idempotencyKey is UUID logical intent retained across timeout/retry.
 */
export type CreateSellerWithdrawalInput = {
  storeId: string;
  quoteId: string;
  idempotencyKey: string;
  /** Optional explicit proof; otherwise requireRecentMfa attaches memory proof. */
  recentMfaProof?: string;
};

export type SellerRevenuePoint = {
  day: string;
  revenue: number;
  orders: number;
};
