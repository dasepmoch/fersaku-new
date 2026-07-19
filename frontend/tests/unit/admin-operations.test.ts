import { describe, expect, it } from "vitest";
import {
  canTransitionKyc,
  apiKycSeed,
  kycAgeLabel,
  matchesKycAgeFilter,
} from "@/features/admin/operations/kyc/data";
import {
  hasVerifiedForceFulfillEvidence,
  initialWebhooks,
  isFailedSellerDelivery,
  isFailedXenditCallback,
} from "@/features/admin/operations/webhooks/data";
import {
  canReviewWithdrawal,
  demoAdminOrders,
  demoInventory,
  demoMerchants,
  demoPayments,
  demoWithdrawals,
} from "@/features/admin/data";
import {
  combineMockAuditChains,
  verifyMockAuditIntegrity,
  withMockAuditIntegrity,
} from "@/features/admin/data/mock-audit";
import { calculateTransactionFee } from "@/shared/finance/fee-policy";

describe("admin transaction source fixtures", () => {
  it("keeps product orders storefront-only and payment sources distinct", () => {
    expect(new Set(demoAdminOrders().map((item) => item.source))).toEqual(
      new Set(["STOREFRONT"]),
    );
    expect(new Set(demoPayments().map((item) => item.source))).toEqual(
      new Set(["STOREFRONT", "QRIS_API"]),
    );
    expect(new Set(demoWithdrawals().map((item) => item.source))).toEqual(
      new Set(["STOREFRONT", "QRIS_API", "MIXED"]),
    );
  });

  it("uses Xendit as the only payment provider in mock mode", () => {
    expect(new Set(demoPayments().map((item) => item.provider))).toEqual(
      new Set(["Xendit"]),
    );
  });

  it("posts 3% + Rp700 only for successful storefront orders", () => {
    for (const order of demoAdminOrders()) {
      if (order.status === "Paid" || order.status === "Fulfilled") {
        expect(order.totalFeeCharged).toBe(
          calculateTransactionFee(order.gross).totalFee,
        );
      } else {
        expect(order.totalFeeCharged).toBe(0);
      }
    }
  });
});

describe("mock audit integrity", () => {
  const events = [
    {
      id: "evt_new",
      actor: "admin@fersaku.id",
      action: "merchant.status.update",
      target: "str_01",
      ip: "mock-admin-session",
      result: "Success",
      time: "baru saja",
      context: "Support ticket SUP-1024",
    },
    {
      id: "evt_old",
      actor: "system",
      action: "payment.finalized",
      target: "pay_01",
      ip: "internal",
      result: "Success",
      time: "1m ago",
    },
  ];

  it("builds and verifies a deterministic newest-first chain", () => {
    const chained = withMockAuditIntegrity(events);
    expect(verifyMockAuditIntegrity(chained)).toBe(true);
    expect(chained[0].previousHash).toBe(chained[1].integrityHash);
    expect(withMockAuditIntegrity(events)).toEqual(chained);
  });

  it("detects tampered event content", () => {
    const chained = withMockAuditIntegrity(events);
    const tampered = chained.map((event, index) =>
      index === 0 ? { ...event, context: "tampered" } : event,
    );
    expect(verifyMockAuditIntegrity(tampered)).toBe(false);
  });

  it("does not repair a tampered stored event while combining seed data", () => {
    const completeChain = withMockAuditIntegrity(events);
    const tamperedStored = [{ ...completeChain[0], context: "tampered" }];
    const combined = combineMockAuditChains(tamperedStored, [events[1]]);
    expect(verifyMockAuditIntegrity(combined)).toBe(false);
  });
});

describe("QRIS API KYC queue helpers", () => {
  it("filters aged applications and formats queue age", () => {
    const newest = apiKycSeed[0];
    const oldest = apiKycSeed[4];
    expect(matchesKycAgeFilter(newest, "30m")).toBe(false);
    expect(matchesKycAgeFilter(oldest, "2h")).toBe(true);
    expect(kycAgeLabel(24)).toBe("24m in queue");
    expect(kycAgeLabel(180)).toBe("3h in queue");
  });

  it("keeps reviewer reason on clarification fixtures", () => {
    const clarification = apiKycSeed.find(
      (item) => item.status === "Needs clarification",
    );
    expect(clarification?.rejectionReason).toBeTruthy();
  });

  it("enforces the KYC state machine and terminal decisions", () => {
    expect(canTransitionKyc("Submitted", "Rejected")).toBe(true);
    expect(canTransitionKyc("Submitted", "Approved")).toBe(false);
    expect(canTransitionKyc("Vendor check", "Approved")).toBe(true);
    expect(canTransitionKyc("Approved", "Rejected")).toBe(false);
    expect(canTransitionKyc("Rejected", "Vendor check")).toBe(false);
  });
});

describe("failed Xendit callback queue", () => {
  it("only includes failed Xendit deliveries", () => {
    const failed = initialWebhooks.filter(isFailedXenditCallback);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((row) => row.source === "Xendit")).toBe(true);
    expect(
      isFailedXenditCallback({
        ...initialWebhooks[0],
        http: "200",
      }),
    ).toBe(false);
  });

  it("keeps seller delivery retry and force-fulfill evidence source-bound", () => {
    const sellerFailure = initialWebhooks.find(isFailedSellerDelivery);
    const forceEligible = initialWebhooks.find(hasVerifiedForceFulfillEvidence);
    expect(sellerFailure?.kind).toBe("SELLER_DELIVERY");
    expect(forceEligible?.kind).toBe("PROVIDER_CALLBACK");
    expect(forceEligible?.fulfillmentEvidence.providerReference).toBe(
      forceEligible?.providerReference,
    );
    expect(forceEligible?.fulfillmentEvidence.amount).toBe(
      forceEligible?.amount,
    );
  });
});

describe("privileged admin state contracts", () => {
  it("never includes credential values in the inventory list snapshot", () => {
    const item = demoInventory().items[0];
    expect(item.schemaPreview).toContain("username");
    expect(item).not.toHaveProperty("values");
  });

  it("restricts withdrawal review to valid pre-disbursement states", () => {
    expect(canReviewWithdrawal("Pending", "Processing")).toBe(true);
    expect(canReviewWithdrawal("On hold", "Processing")).toBe(true);
    expect(canReviewWithdrawal("Processing", "Rejected")).toBe(false);
    expect(canReviewWithdrawal("Completed", "On hold")).toBe(false);
  });
});

describe("merchant access fixtures", () => {
  it("exposes API access state independently from merchant status", () => {
    const merchant = demoMerchants()[0];
    expect(merchant.status).toBe("Active");
    expect(merchant.apiAccess).toBe("Enabled");
    expect(demoMerchants().some((item) => item.apiAccess === "Suspended")).toBe(
      true,
    );
  });
});
