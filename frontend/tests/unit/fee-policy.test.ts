import { describe, expect, it } from "vitest";
import {
  calculateTransactionFee,
  calculateWithdrawalFee,
  FERSAKU_FEE_POLICY,
} from "@/shared/finance/fee-policy";
import { allocateWithdrawalSources } from "@/shared/finance/source-allocation";
import {
  demoFinanceSummary,
  demoSellerWithdrawals,
} from "@/features/finance/demo-data";
import {
  canRequestSellerWithdrawal,
  isSellerWithdrawalLockActive,
} from "@/features/finance/withdrawal-policy";
import { requestSellerWithdrawalQuote } from "@/features/finance/api";

describe("Fersaku fee policy", () => {
  it("uses the same 3% + Rp700 fee for a successful payment", () => {
    const result = calculateTransactionFee(100_000);
    expect(result.platformFee).toBe(3_000);
    expect(result.processingFee).toBe(
      FERSAKU_FEE_POLICY.transactionProcessingFee,
    );
    expect(result.totalFee).toBe(3_700);
    expect(result.netAmount).toBe(96_300);
  });

  it("keeps provider withdrawal processing fee explicit", () => {
    const withoutProviderFee = calculateWithdrawalFee(100_000);
    expect(withoutProviderFee.platformFee).toBe(3_000);
    expect(withoutProviderFee.processingFee).toBeNull();
    expect(withoutProviderFee.totalFee).toBeNull();
    expect(withoutProviderFee.belowMinimum).toBe(false);

    const withProviderFee = calculateWithdrawalFee(100_000, 2_500);
    expect(withProviderFee.totalFee).toBe(5_500);
    expect(withProviderFee.netAmount).toBe(94_500);
  });

  it("flags withdrawal requests below Rp50.000", () => {
    const result = calculateWithdrawalFee(49_999);
    expect(result.belowMinimum).toBe(true);
    expect(result.minimumAmount).toBe(50_000);
  });

  it("treats expired bank locks as open and active locks as closed", () => {
    const now = new Date("2026-07-16T12:00:00+07:00");
    const expired = {
      locked: true as const,
      reasonCode: "BANK_ACCOUNT_CHANGED" as const,
      unlockedAt: "2026-07-13T14:42:00+07:00",
      remainingLabel: "expired",
    };
    const active = {
      ...expired,
      unlockedAt: "2026-07-17T14:42:00+07:00",
    };
    expect(isSellerWithdrawalLockActive(expired, now)).toBe(false);
    expect(isSellerWithdrawalLockActive(active, now)).toBe(true);
    expect(
      canRequestSellerWithdrawal({
        amount: 50_000,
        availableAmount: 100_000,
        lock: expired,
        now,
      }),
    ).toBe(true);
  });

  it("returns an explicit verified Xendit fee quote before withdrawal", async () => {
    const quote = await requestSellerWithdrawalQuote({
      storeId: "store_demo_asep",
      bankAccountId: "bank_bca_4821",
      amount: 100_000,
    });
    expect(quote).toMatchObject({
      platformFee: 3_000,
      providerProcessingFee: 2_500,
      totalFee: 5_500,
      netAmount: 94_500,
      provider: "Xendit",
      status: "VERIFIED",
    });
  });

  it("keeps storefront and QRIS API in one source-aware wallet", () => {
    const summary = demoFinanceSummary();
    expect(
      summary.sources.STOREFRONT.availableAmount +
        summary.sources.QRIS_API.availableAmount,
    ).toBe(summary.availableAmount);
    expect(
      summary.sources.STOREFRONT.pendingAmount +
        summary.sources.QRIS_API.pendingAmount,
    ).toBe(summary.pendingAmount);
    expect(
      demoSellerWithdrawals().some((item) => item.source === "MIXED"),
    ).toBe(true);
  });
});

describe("withdrawal source allocation", () => {
  it("uses one source when its available balance covers the request", () => {
    expect(
      allocateWithdrawalSources(5_000_000, {
        storefrontAmount: 12_000_000,
        qrisApiAmount: 6_240_500,
      }),
    ).toMatchObject({
      source: "STOREFRONT",
      storefrontAmount: 5_000_000,
      qrisApiAmount: 0,
      shortfallAmount: 0,
    });
  });

  it("attributes a cross-source request as mixed and reports shortfall", () => {
    expect(
      allocateWithdrawalSources(10_000, {
        storefrontAmount: 4_000,
        qrisApiAmount: 5_000,
      }),
    ).toEqual({
      source: "MIXED",
      storefrontAmount: 4_000,
      qrisApiAmount: 5_000,
      allocatedAmount: 9_000,
      shortfallAmount: 1_000,
    });
  });
});
