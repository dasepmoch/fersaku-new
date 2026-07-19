import type { SellerWithdrawalLock } from "./contracts";

export const SELLER_WITHDRAWAL_MINIMUM = 50_000;

export function isSellerWithdrawalLockActive(
  lock: SellerWithdrawalLock | null | undefined,
  now: number | Date = Date.now(),
) {
  if (!lock?.locked || !lock.unlockedAt) return false;
  const current = now instanceof Date ? now.getTime() : now;
  const unlockedAt = new Date(lock.unlockedAt).getTime();
  return Number.isFinite(unlockedAt) && unlockedAt > current;
}

export function canRequestSellerWithdrawal(input: {
  amount: number;
  availableAmount: number;
  lock: SellerWithdrawalLock | null | undefined;
  now?: number | Date;
}) {
  return (
    Number.isInteger(input.amount) &&
    input.amount >= SELLER_WITHDRAWAL_MINIMUM &&
    input.amount <= input.availableAmount &&
    !isSellerWithdrawalLockActive(input.lock, input.now)
  );
}
