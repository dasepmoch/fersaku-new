import type { FinanceSource } from "./source-badge";

export type WithdrawalSourceAllocation = {
  source: FinanceSource;
  storefrontAmount: number;
  qrisApiAmount: number;
  allocatedAmount: number;
  shortfallAmount: number;
};

const money = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

/**
 * Preview a deterministic Storefront-first FIFO allocation.
 * The production withdrawal quote remains authoritative and persists the
 * exact per-source allocation used by the ledger transaction.
 */
export function allocateWithdrawalSources(
  amount: number,
  balances: { storefrontAmount: number; qrisApiAmount: number },
): WithdrawalSourceAllocation {
  const requested = money(amount);
  const storefrontAvailable = money(balances.storefrontAmount);
  const qrisApiAvailable = money(balances.qrisApiAmount);
  const storefrontAmount = Math.min(requested, storefrontAvailable);
  const remainder = requested - storefrontAmount;
  const qrisApiAmount = Math.min(remainder, qrisApiAvailable);
  const allocatedAmount = storefrontAmount + qrisApiAmount;
  const source: FinanceSource =
    storefrontAmount > 0 && qrisApiAmount > 0
      ? "MIXED"
      : qrisApiAmount > 0
        ? "QRIS_API"
        : "STOREFRONT";

  return {
    source,
    storefrontAmount,
    qrisApiAmount,
    allocatedAmount,
    shortfallAmount: Math.max(0, requested - allocatedAmount),
  };
}
