import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminWithdrawalDtoSchema,
  adminWithdrawalReviewResultSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  canReviewWithdrawal,
  demoWithdrawals,
  getWithdrawal,
  listWithdrawals,
  listWithdrawalsPage,
  reviewAdminWithdrawal,
} from "@/features/admin/data";
import {
  humanizeAdminWithdrawalStatus,
  mapAdminWithdrawalDto,
  mapAdminWithdrawalFeeDisplay,
  toAdminWithdrawalReviewAction,
} from "@/features/admin/data/mappers";
import { queryKeys } from "@/shared/query/query-keys";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/api/http-client")
  >("@/shared/api/http-client");
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

function installApiAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const meta = {
  requestId: "req_adm310",
  timestamp: "2026-07-17T12:00:00Z",
  hasMore: false,
  nextCursor: null,
};

const sampleWithdrawal = {
  id: "WD-120724-0092",
  merchant: "Asep AI Tools",
  owner: "Asep Kurnia",
  amount: 12_000_000,
  bank: "BCA • 4821",
  account: "ASEP KURNIA",
  risk: "Low",
  status: "Pending",
  requested: "12 Jul, 14:06",
  source: "MIXED",
  providerProcessingFee: 2_500,
  providerFeeStatus: "VERIFIED",
  providerFeeReference: "xnd_quote_0092",
};

describe("ADM-310 admin withdrawal review/disbursement", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps domain and FE statuses to AdminStatus labels", () => {
    expect(humanizeAdminWithdrawalStatus("Pending")).toBe("Pending");
    expect(humanizeAdminWithdrawalStatus("PROCESSING")).toBe("Processing");
    expect(humanizeAdminWithdrawalStatus("HELD")).toBe("On hold");
    expect(humanizeAdminWithdrawalStatus("UNKNOWN_OUTCOME")).toBe("Failed");
    expect(humanizeAdminWithdrawalStatus("APPROVED")).toBe("Pending");
    expect(humanizeAdminWithdrawalStatus("REJECTED")).toBe("Rejected");
  });

  it("maps review UI targets to wire approve|hold|reject", () => {
    expect(toAdminWithdrawalReviewAction("Processing")).toBe("approve");
    expect(toAdminWithdrawalReviewAction("On hold")).toBe("hold");
    expect(toAdminWithdrawalReviewAction("Rejected")).toBe("reject");
    expect(toAdminWithdrawalReviewAction("approve")).toBe("approve");
    expect(toAdminWithdrawalReviewAction("bogus")).toBeNull();
  });

  it("restricts client review gate to pre-disbursement states", () => {
    expect(canReviewWithdrawal("Pending", "Processing")).toBe(true);
    expect(canReviewWithdrawal("On hold", "Processing")).toBe(true);
    expect(canReviewWithdrawal("On hold", "Rejected")).toBe(true);
    expect(canReviewWithdrawal("Processing", "Rejected")).toBe(false);
    expect(canReviewWithdrawal("Completed", "On hold")).toBe(false);
    expect(canReviewWithdrawal("Failed", "Processing")).toBe(false);
  });

  it("maps admin withdrawal DTO without inventing money", () => {
    const view = mapAdminWithdrawalDto(
      adminWithdrawalDtoSchema.parse(sampleWithdrawal),
    );
    expect(view.amount).toBe(12_000_000);
    expect(view.providerProcessingFee).toBe(2_500);
    expect(view.providerFeeStatus).toBe("VERIFIED");
    expect(view.source).toBe("MIXED");
    expect(view.status).toBe("Pending");
  });

  it("fee display never recomputes platform fee from amount", () => {
    const onlyProvider = mapAdminWithdrawalFeeDisplay({
      providerProcessingFee: 2_500,
    });
    expect(onlyProvider.platformFee).toBeNull();
    expect(onlyProvider.netAmount).toBeNull();
    expect(onlyProvider.processingFee).toBe(2_500);

    const withServer = mapAdminWithdrawalFeeDisplay({
      platformFee: 360_000,
      netDisbursement: 11_637_500,
      providerProcessingFee: 2_500,
    });
    expect(withServer.platformFee).toBe(360_000);
    expect(withServer.netAmount).toBe(11_637_500);
  });

  it("rejects fractional withdrawal amount in schema", () => {
    expect(() =>
      adminWithdrawalDtoSchema.parse({
        ...sampleWithdrawal,
        amount: 12_000_000.5,
      }),
    ).toThrow();
  });

  it("permission deny: withdrawals.review required", () => {
    expect(claimsHavePermission(["orders.read"], "withdrawals.review")).toBe(
      false,
    );
    expect(
      claimsHavePermission(["withdrawals.review"], "withdrawals.review"),
    ).toBe(true);
    expect(claimsHavePermission(null, "withdrawals.review")).toBe(false);
    expect(claimsHavePermission(["*"], "withdrawals.review")).toBe(true);
  });

  it("mock path never hits transport for list/detail/review", async () => {
    installMockAdmin();
    const list = await listWithdrawals();
    expect(list.length).toBeGreaterThan(0);
    expect(demoWithdrawals().length).toBe(list.length);
    const page = await listWithdrawalsPage({ limit: 2 });
    expect(page.items.length).toBeLessThanOrEqual(2);
    const detail = await getWithdrawal(list[0]!.id);
    expect(detail?.id).toBe(list[0]!.id);
    const reviewed = await reviewAdminWithdrawal({
      withdrawalId: list[0]!.id,
      target: "Processing",
      reason: "Approve verified payout after bank and fee checks",
      currentStatus: "Pending",
      providerFeeStatus: "VERIFIED",
      providerProcessingFee: 2_500,
    });
    expect(reviewed.displayStatus).toBe("Processing");
    expect(reviewed.action).toBe("approve");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list uses GET /v1/admin/withdrawals (canonical no-slash)", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [sampleWithdrawal],
      meta,
    });
    const rows = await listWithdrawals({ limit: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(12_000_000);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/withdrawals",
      expect.objectContaining({
        query: expect.objectContaining({ limit: 50 }),
      }),
    );
  });

  it("api detail uses GET /v1/admin/withdrawals/{id}", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...sampleWithdrawal, status: "On hold" },
      meta,
    });
    const row = await getWithdrawal("WD-120724-0092");
    expect(row?.status).toBe("On hold");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/withdrawals/WD-120724-0092",
      expect.objectContaining({}),
    );
  });

  it("api review posts typed action approve|hold|reject with MFA + idempotency", async () => {
    installApiAdmin();
    const body = adminWithdrawalReviewResultSchema.parse({
      id: "WD-120724-0092",
      status: "PROCESSING",
      amountDebited: 12_000_000,
      platformFee: 360_000,
      providerProcessingFee: 2_500,
      netDisbursement: 11_637_500,
    });
    apiRequestMock.mockResolvedValueOnce({
      data: body,
      meta,
    });
    const result = await reviewAdminWithdrawal({
      withdrawalId: "WD-120724-0092",
      target: "Processing",
      reason: "Approve verified payout after bank and fee checks",
      currentStatus: "Pending",
      providerFeeStatus: "VERIFIED",
      providerProcessingFee: 2_500,
      idempotencyKey: "idem_adm310",
    });
    expect(result.displayStatus).toBe("Processing");
    expect(result.action).toBe("approve");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/withdrawals/WD-120724-0092/review",
      expect.objectContaining({
        method: "POST",
        body: {
          action: "approve",
          reason: "Approve verified payout after bank and fee checks",
        },
        idempotencyKey: "idem_adm310",
        auditReason: "Approve verified payout after bank and fee checks",
        requireRecentMfa: true,
      }),
    );
  });

  it("api hold and reject map wire actions", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { id: "WD-1", status: "HELD" },
      meta,
    });
    const held = await reviewAdminWithdrawal({
      withdrawalId: "WD-1",
      target: "On hold",
      reason: "Hold pending additional merchant volume review notes",
      currentStatus: "Pending",
    });
    expect(held.displayStatus).toBe("On hold");
    expect(apiRequestMock.mock.calls[0]![1].body).toEqual({
      action: "hold",
      reason: "Hold pending additional merchant volume review notes",
    });

    apiRequestMock.mockResolvedValueOnce({
      data: { id: "WD-1", status: "REJECTED" },
      meta,
    });
    const rejected = await reviewAdminWithdrawal({
      withdrawalId: "WD-1",
      target: "Rejected",
      reason: "Reject duplicate payout attempt after risk review",
      currentStatus: "Pending",
    });
    expect(rejected.displayStatus).toBe("Rejected");
    expect(apiRequestMock.mock.calls[1]![1].body.action).toBe("reject");
  });

  it("rejects short reason, invalid action, wrong state, missing fee without transport", async () => {
    installApiAdmin();
    await expect(
      reviewAdminWithdrawal({
        withdrawalId: "WD-x",
        target: "Processing",
        reason: "too short",
      }),
    ).rejects.toThrow(/12 characters/);
    await expect(
      reviewAdminWithdrawal({
        withdrawalId: "WD-x",
        target: "Unknown",
        reason: "Valid reason length for audit trail here",
      }),
    ).rejects.toThrow(/action must be/);
    await expect(
      reviewAdminWithdrawal({
        withdrawalId: "WD-x",
        target: "Processing",
        reason: "Valid reason length for audit trail here",
        currentStatus: "Processing",
      }),
    ).rejects.toThrow(/no longer allowed/);
    await expect(
      reviewAdminWithdrawal({
        withdrawalId: "WD-x",
        target: "Processing",
        reason: "Valid reason length for audit trail here",
        currentStatus: "Pending",
        providerFeeStatus: "UNAVAILABLE",
        providerProcessingFee: null,
      }),
    ).rejects.toThrow(/verified provider fee/);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("admin withdrawals query key is bounded and filter-scoped", () => {
    expect(queryKeys.admin.withdrawals({ status: "Pending" })).toEqual([
      "admin",
      "withdrawals",
      "bounded",
      { status: "Pending" },
    ]);
    expect(queryKeys.admin.withdrawal("WD-1")).toEqual([
      "admin",
      "withdrawals",
      "WD-1",
    ]);
  });
});
