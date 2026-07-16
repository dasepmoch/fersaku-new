import type { FinanceSource } from "@/shared/finance/source-badge";

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
};

export type SellerLedgerItem = {
  id: string;
  storeId: string;
  type: "SALE" | "PLATFORM_FEE" | "PROVIDER_FEE" | "WITHDRAWAL" | "ADJUSTMENT";
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
};

export type RequestSellerWithdrawalQuoteInput = {
  storeId: string;
  bankAccountId: string;
  amount: number;
};

export type CreateSellerWithdrawalInput = {
  storeId: string;
  quoteId: string;
  reauthProof: string;
  idempotencyKey: string;
};

export type SellerRevenuePoint = {
  day: string;
  revenue: number;
  orders: number;
};
