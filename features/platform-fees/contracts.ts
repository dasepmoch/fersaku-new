/**
 * Public marketing fee copy view model (PUB-110).
 * Amounts come from GET /v1/platform/fees — not invented marketing constants.
 */

export type PublicFeeMarketingCopy = {
  /** Active policy version id (e.g. LAUNCH_FEE_POLICY_V1). */
  policyVersion: string;
  /** e.g. "3% + Rp700" */
  transaction: string;
  /** e.g. "3% + biaya proses" */
  withdrawal: string;
  /** e.g. "Rp50.000" */
  minimumWithdrawal: string;
  transactionPercentBps: number;
  transactionFixedIdr: number;
  withdrawalPercentBps: number;
  minimumWithdrawalIdr: number;
  source: "api" | "mock" | "last_known" | "launch_fallback";
};
