/**
 * The single source of truth for the public Fersaku fee policy.
 *
 * Storefront payments and QRIS API payments use the same transaction fee:
 * 3% of the successful amount plus Rp700 processing. Withdrawals use a 3%
 * platform fee plus the provider's processing charge and cannot be requested
 * below Rp50.000. The provider charge is intentionally optional because it is
 * returned by the disbursement provider and may change independently from
 * Fersaku's platform policy.
 */

export const FERSAKU_FEE_POLICY = {
  transactionRatePercent: 3,
  transactionProcessingFee: 700,
  withdrawalRatePercent: 3,
  withdrawalMinimumAmount: 50_000,
} as const;

export type TransactionFeeBreakdown = {
  amount: number;
  platformFee: number;
  processingFee: number;
  totalFee: number;
  netAmount: number;
};

export type WithdrawalFeeBreakdown = {
  amount: number;
  platformFee: number;
  processingFee: number | null;
  totalFee: number | null;
  netAmount: number | null;
  minimumAmount: number;
  belowMinimum: boolean;
};

function normaliseAmount(amount: number) {
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount));
}

/** Calculate the fee charged when a storefront or QRIS API payment succeeds. */
export function calculateTransactionFee(
  amount: number,
): TransactionFeeBreakdown {
  const normalisedAmount = normaliseAmount(amount);
  const platformFee = Math.round(
    normalisedAmount * (FERSAKU_FEE_POLICY.transactionRatePercent / 100),
  );
  const processingFee = FERSAKU_FEE_POLICY.transactionProcessingFee;
  const totalFee = platformFee + processingFee;
  return {
    amount: normalisedAmount,
    platformFee,
    processingFee,
    totalFee,
    netAmount: Math.max(0, normalisedAmount - totalFee),
  };
}

/**
 * Calculate withdrawal charges. `processingFee` is optional on purpose: the
 * Xendit disbursement charge is provider-priced and must not be guessed by
 * the client. When omitted, the UI can show "3% + biaya proses" without
 * presenting a false total.
 */
export function calculateWithdrawalFee(
  amount: number,
  processingFee?: number | null,
): WithdrawalFeeBreakdown {
  const normalisedAmount = normaliseAmount(amount);
  const platformFee = Math.round(
    normalisedAmount * (FERSAKU_FEE_POLICY.withdrawalRatePercent / 100),
  );
  const providerFee =
    processingFee == null ? null : normaliseAmount(processingFee);
  const totalFee = providerFee == null ? null : platformFee + providerFee;
  return {
    amount: normalisedAmount,
    platformFee,
    processingFee: providerFee,
    totalFee,
    netAmount:
      totalFee == null ? null : Math.max(0, normalisedAmount - totalFee),
    minimumAmount: FERSAKU_FEE_POLICY.withdrawalMinimumAmount,
    belowMinimum: normalisedAmount < FERSAKU_FEE_POLICY.withdrawalMinimumAmount,
  };
}
