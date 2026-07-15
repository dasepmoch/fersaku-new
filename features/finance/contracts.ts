export type SellerFinanceSummary = {
  storeId: string;
  availableAmount: number;
  pendingAmount: number;
  heldAmount: number;
  lifetimeGrossAmount: number;
  monthGrossAmount: number;
  monthPlatformFeeAmount: number;
  monthProviderFeeAmount: number;
  monthRefundAmount: number;
  monthNetAmount: number;
  currency: "IDR";
  asOf: string;
};

export type SellerLedgerItem = {
  id: string;
  storeId: string;
  type:
    | "SALE"
    | "PLATFORM_FEE"
    | "PROVIDER_FEE"
    | "WITHDRAWAL"
    | "REFUND"
    | "ADJUSTMENT";
  description: string;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  occurredAt: string;
  orderId?: string;
  withdrawalId?: string;
};

export type SellerWithdrawalStatus = "Completed" | "Processing" | "Failed";

export type SellerWithdrawal = {
  id: string;
  storeId: string;
  amount: number;
  bankLabel: string;
  status: SellerWithdrawalStatus;
  requestedAt: string;
};

export type SellerWithdrawalLock = {
  locked: boolean;
  reasonCode: "BANK_ACCOUNT_CHANGED" | null;
  unlockedAt: string | null;
  remainingLabel: string | null;
};
