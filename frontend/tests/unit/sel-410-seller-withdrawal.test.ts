import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  moneyIdrSchema,
  withdrawalCreateRequestSchema,
  withdrawalDtoSchema,
  withdrawalEnvelopeSchema,
  withdrawalListEnvelopeSchema,
  withdrawalLockDtoSchema,
  withdrawalLockEnvelopeSchema,
  withdrawalQuoteDtoSchema,
  withdrawalQuoteEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import {
  formatWithdrawalBankLabel,
  isSellerWithdrawalQuoteFresh,
  mapWithdrawalDto,
  mapWithdrawalListDto,
  mapWithdrawalLockDto,
  mapWithdrawalQuoteDto,
  mapWithdrawalStatusToView,
} from "@/features/finance/mappers";
import {
  createSellerWithdrawal,
  getSellerWithdrawalLock,
  listSellerWithdrawals,
  requestSellerWithdrawalQuote,
} from "@/features/finance/api";
import {
  demoSellerWithdrawals,
  demoWithdrawalLock,
} from "@/features/finance/demo-data";
import { queryKeys } from "@/shared/query/query-keys";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import {
  __resetRecentMfaProofForTests,
  setRecentMfaProof,
} from "@/shared/api/recent-mfa-proof";

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

function installApiFinance() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockFinance() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const AS_OF = "2026-07-17T07:00:00Z";
const EXPIRES = "2026-07-17T08:00:00Z";

const quoteDto = {
  quoteId: "wqt_01",
  expiresAt: EXPIRES,
  amountDebited: 100_000,
  platformFee: 3_000,
  providerProcessingFee: 2_500,
  totalFee: 5_500,
  netDisbursement: 94_500,
  minimumAmount: 50_000,
  policyVersion: "LAUNCH_FEE_POLICY_V1",
  bankAccountId: "bank_1",
  bankAccountVersion: 1,
  status: "ACTIVE",
};

const withdrawalDto = {
  id: "wd_01",
  status: "REQUESTED",
  amountDebited: 100_000,
  platformFee: 3_000,
  providerProcessingFee: 2_500,
  totalFee: 5_500,
  netDisbursement: 94_500,
  source: "STOREFRONT",
  bankAccountId: "bank_1",
  bankAccountMasked: "•••• 4821",
  bankCode: "BCA",
  accountHolderName: "ASEP KURNIA",
  policyVersion: "LAUNCH_FEE_POLICY_V1",
  createdAt: "2026-07-17T07:05:00Z",
};

describe("SEL-410 seller withdrawal quote / create / lock", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
    __resetRecentMfaProofForTests();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
    __resetRecentMfaProofForTests();
  });

  it("parses integer IDR money on quote/withdrawal DTOs", () => {
    expect(moneyIdrSchema.parse(100_000)).toBe(100_000);
    expect(withdrawalQuoteDtoSchema.parse(quoteDto).amountDebited).toBe(
      100_000,
    );
    expect(withdrawalDtoSchema.parse(withdrawalDto).amountDebited).toBe(
      100_000,
    );
    expect(() =>
      withdrawalQuoteDtoSchema.parse({ ...quoteDto, amountDebited: 100_000.5 }),
    ).toThrow();
  });

  it("maps quote money from server without client recompute of net", () => {
    const view = mapWithdrawalQuoteDto(
      {
        ...quoteDto,
        // Deliberately inconsistent with platform+provider: server wins.
        netDisbursement: 90_000,
      },
      "store_a",
    );
    expect(view.id).toBe("wqt_01");
    expect(view.amount).toBe(100_000);
    expect(view.platformFee).toBe(3_000);
    expect(view.providerProcessingFee).toBe(2_500);
    expect(view.totalFee).toBe(5_500);
    expect(view.netAmount).toBe(90_000);
    expect(view.status).toBe("VERIFIED");
    expect(view.bankAccountId).toBe("bank_1");
    expect(view.storeId).toBe("store_a");
  });

  it("maps withdrawal list status and bank mask to existing rows", () => {
    expect(mapWithdrawalStatusToView("REQUESTED")).toBe("Pending");
    expect(mapWithdrawalStatusToView("PROCESSING")).toBe("Processing");
    expect(mapWithdrawalStatusToView("COMPLETED")).toBe("Completed");
    expect(mapWithdrawalStatusToView("FAILED")).toBe("Failed");
    expect(mapWithdrawalStatusToView("UNKNOWN_OUTCOME")).toBe("Processing");
    expect(formatWithdrawalBankLabel("BCA", "•••• 4821")).toBe("BCA • 4821");

    const rows = mapWithdrawalListDto(
      [
        withdrawalDto,
        { ...withdrawalDto, id: "wd_02", status: "COMPLETED", source: "MIXED" },
      ],
      "store_a",
      Date.parse("2026-07-17T07:06:00Z"),
    );
    expect(rows[0]!.status).toBe("Pending");
    expect(rows[0]!.amount).toBe(100_000);
    expect(rows[0]!.bankLabel).toBe("BCA • 4821");
    expect(rows[0]!.source).toBe("STOREFRONT");
    expect(rows[1]!.status).toBe("Completed");
  });

  it("maps lock lockedUntil/reason to unlockedAt/reasonCode/remainingLabel", () => {
    const lockedUntil = "2026-07-18T07:00:00Z";
    const now = Date.parse("2026-07-17T07:00:00Z");
    const active = mapWithdrawalLockDto(
      {
        locked: true,
        lockedUntil,
        reason: "BANK_ACCOUNT_CHANGED",
      },
      now,
    );
    expect(active.locked).toBe(true);
    expect(active.unlockedAt).toBe(lockedUntil);
    expect(active.reasonCode).toBe("BANK_ACCOUNT_CHANGED");
    expect(active.remainingLabel).toBeTruthy();

    const open = mapWithdrawalLockDto({ locked: false }, now);
    expect(open.locked).toBe(false);
    expect(open.unlockedAt).toBeNull();
    expect(open.reasonCode).toBeNull();
  });

  it("detects expired quote for requote gate", () => {
    const quote = mapWithdrawalQuoteDto(quoteDto, "store_a");
    expect(
      isSellerWithdrawalQuoteFresh(quote, Date.parse("2026-07-17T07:30:00Z")),
    ).toBe(true);
    expect(
      isSellerWithdrawalQuoteFresh(quote, Date.parse("2026-07-17T09:00:00Z")),
    ).toBe(false);
  });

  it("create request schema is quoteId only (no reauthProof body)", () => {
    const body = withdrawalCreateRequestSchema.parse({ quoteId: "wqt_01" });
    expect(body).toEqual({ quoteId: "wqt_01" });
    expect(
      withdrawalCreateRequestSchema.safeParse({
        quoteId: "wqt_01",
        reauthProof: "secret",
      }).success,
    ).toBe(true);
    // Extra keys stripped by zod object default strip
    expect(
      withdrawalCreateRequestSchema.parse({
        quoteId: "wqt_01",
        reauthProof: "secret",
      }),
    ).toEqual({ quoteId: "wqt_01" });
  });

  it("API quote posts amount/bankAccountId with idempotency and maps response", async () => {
    installApiFinance();
    apiRequestMock.mockResolvedValueOnce({
      data: quoteDto,
      meta: { requestId: "req_q", timestamp: AS_OF },
    });

    const quote = await requestSellerWithdrawalQuote({
      storeId: "store_live",
      bankAccountId: "bank_1",
      amount: 100_000,
      idempotencyKey: "idem-quote-stable-uuid",
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/withdrawal-quotes");
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual({
      amount: 100_000,
      bankAccountId: "bank_1",
    });
    expect(opts.idempotencyKey).toBe("idem-quote-stable-uuid");
    expect(opts.schema).toBe(withdrawalQuoteEnvelopeSchema);
    expect(quote.netAmount).toBe(94_500);
    expect(quote.id).toBe("wqt_01");
  });

  it("API create uses requireRecentMfa, no body reauthProof, trailing slash path", async () => {
    installApiFinance();
    setRecentMfaProof("proof_wd_create", {
      purpose: "withdrawal.create",
      expiresAt: Date.now() + 60_000,
    });
    apiRequestMock.mockResolvedValueOnce({
      data: withdrawalDto,
      meta: { requestId: "req_c", timestamp: AS_OF },
    });

    const result = await createSellerWithdrawal({
      storeId: "store_live",
      quoteId: "wqt_01",
      idempotencyKey: "idem-create-stable-uuid",
    });

    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/withdrawals/");
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual({ quoteId: "wqt_01" });
    expect(opts.body).not.toHaveProperty("reauthProof");
    expect(opts.requireRecentMfa).toBe(true);
    expect(opts.idempotencyKey).toBe("idem-create-stable-uuid");
    expect(opts.schema).toBe(withdrawalEnvelopeSchema);
    expect(result.amount).toBe(100_000);
    expect(result.status).toBe("Pending");
    expect(result.storeId).toBe("store_live");
  });

  it("API create accepts explicit recentMfaProof without body field", async () => {
    installApiFinance();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...withdrawalDto, status: "UNDER_REVIEW" },
      meta: { requestId: "req_c2", timestamp: AS_OF },
    });

    await createSellerWithdrawal({
      storeId: "store_live",
      quoteId: "wqt_01",
      idempotencyKey: "idem-2",
      recentMfaProof: "explicit-proof",
    });

    const opts = apiRequestMock.mock.calls[0]![1] as {
      recentMfaProof?: string;
      requireRecentMfa?: boolean;
      body: Record<string, unknown>;
    };
    expect(opts.recentMfaProof).toBe("explicit-proof");
    expect(opts.requireRecentMfa).toBe(true);
    expect(opts.body).not.toHaveProperty("reauthProof");
  });

  it("API list unwraps items envelope and maps money", async () => {
    installApiFinance();
    apiRequestMock.mockResolvedValueOnce({
      data: { items: [withdrawalDto] },
      meta: { requestId: "req_l", timestamp: AS_OF },
    });

    const rows = await listSellerWithdrawals("store_live");
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/withdrawals/");
    expect(opts.schema).toBe(withdrawalListEnvelopeSchema);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(100_000);
    expect(rows[0]!.bankLabel).toBe("BCA • 4821");
  });

  it("API lock maps wire fields", async () => {
    installApiFinance();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        locked: true,
        lockedUntil: "2099-07-20T00:00:00Z",
        reason: "BANK_ACCOUNT_CHANGED",
      },
      meta: { requestId: "req_lock", timestamp: AS_OF },
    });

    const lock = await getSellerWithdrawalLock("store_live");
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/withdrawals/lock");
    expect(opts.schema).toBe(withdrawalLockEnvelopeSchema);
    expect(lock.locked).toBe(true);
    expect(lock.unlockedAt).toBe("2099-07-20T00:00:00Z");
    expect(lock.reasonCode).toBe("BANK_ACCOUNT_CHANGED");
  });

  it("mock path never hits transport for quote/list/lock", async () => {
    installMockFinance();
    const quote = await requestSellerWithdrawalQuote({
      storeId: DEMO_STORE_ID,
      bankAccountId: "bank_bca_4821",
      amount: 100_000,
    });
    const list = await listSellerWithdrawals(DEMO_STORE_ID);
    const lock = await getSellerWithdrawalLock(DEMO_STORE_ID);
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(quote.status).toBe("VERIFIED");
    expect(quote.providerProcessingFee).toBe(2_500);
    expect(list.length).toBeGreaterThan(0);
    expect(lock).toEqual(demoWithdrawalLock);
    expect(
      list.some((w) => w.id === demoSellerWithdrawals(DEMO_STORE_ID)[0]!.id),
    ).toBe(true);
  });

  it("mock create requires fresh quote and stable idempotency key", async () => {
    installMockFinance();
    const quote = await requestSellerWithdrawalQuote({
      storeId: DEMO_STORE_ID,
      bankAccountId: "bank_bca_4821",
      amount: 100_000,
    });
    const created = await createSellerWithdrawal({
      storeId: DEMO_STORE_ID,
      quoteId: quote.id,
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
    });
    expect(created.amount).toBe(100_000);
    expect(created.status).toBe("Pending");
    expect(apiRequestMock).not.toHaveBeenCalled();

    await expect(
      createSellerWithdrawal({
        storeId: DEMO_STORE_ID,
        quoteId: quote.id,
        idempotencyKey: "retry-same-after-consume",
      }),
    ).rejects.toBeTruthy();
  });

  it("query keys isolate store for withdrawals and lock", () => {
    expect(queryKeys.seller.withdrawals("store_a")[1]).toBe("store_a");
    expect(queryKeys.seller.withdrawalLock("store_a")).not.toEqual(
      queryKeys.seller.withdrawalLock("store_b"),
    );
    expect(queryKeys.seller.finance("store_a")).not.toEqual(
      queryKeys.seller.finance("store_b"),
    );
  });

  it("parses lock and list envelopes", () => {
    expect(withdrawalLockDtoSchema.parse({ locked: false }).locked).toBe(false);
    expect(
      withdrawalListEnvelopeSchema.parse({
        data: { items: [withdrawalDto] },
        meta: { requestId: "r", timestamp: AS_OF },
      }).data.items[0]!.id,
    ).toBe("wd_01");
  });

  it("mapWithdrawalDto fails closed on empty id", () => {
    expect(() =>
      mapWithdrawalDto({ ...withdrawalDto, id: "  " }, "store_a"),
    ).toThrow();
  });
});
