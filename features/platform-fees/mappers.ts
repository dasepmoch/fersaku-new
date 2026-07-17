/**
 * Fee policy DTO → marketing copy strings (PUB-110).
 * Pure; uses existing rupiah formatter. Does not invent fee numbers.
 */

import type { FeePolicyDto } from "@/shared/api/schemas";
import { rupiah } from "@/shared/format/money";
import type { PublicFeeMarketingCopy } from "./contracts";

/** Format basis points as a whole/fractional percent label (300 → "3%"). */
export function formatFeePercentFromBps(bps: number): string {
  if (!Number.isFinite(bps) || !Number.isInteger(bps)) {
    throw new Error("fee percent bps must be a finite integer");
  }
  if (bps < 0) {
    throw new Error("fee percent bps must be non-negative");
  }
  const whole = Math.trunc(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return `${whole}%`;
  const fracStr = String(frac).padStart(2, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}%`;
}

/** Launch-style transaction fee: "3% + Rp700". */
export function formatTransactionFeeLabel(
  percentBps: number,
  fixedIdr: number,
): string {
  return `${formatFeePercentFromBps(percentBps)} + ${rupiah(fixedIdr)}`;
}

/** Withdrawal marketing line keeps provider processing as copy, not a guessed IDR. */
export function formatWithdrawalFeeLabel(percentBps: number): string {
  return `${formatFeePercentFromBps(percentBps)} + biaya proses`;
}

export function mapFeePolicyDtoToMarketingCopy(
  dto: FeePolicyDto,
  source: PublicFeeMarketingCopy["source"],
): PublicFeeMarketingCopy {
  return {
    policyVersion: dto.policyVersion,
    transaction: formatTransactionFeeLabel(
      dto.transactionPercentBps,
      dto.transactionFixedIdr,
    ),
    withdrawal: formatWithdrawalFeeLabel(dto.withdrawalPercentBps),
    minimumWithdrawal: rupiah(dto.minimumWithdrawalIdr),
    transactionPercentBps: dto.transactionPercentBps,
    transactionFixedIdr: dto.transactionFixedIdr,
    withdrawalPercentBps: dto.withdrawalPercentBps,
    minimumWithdrawalIdr: dto.minimumWithdrawalIdr,
    source,
  };
}
