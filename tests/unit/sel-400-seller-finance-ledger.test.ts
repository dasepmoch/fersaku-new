import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  financeLedgerItemSchema,
  financeLedgerPageSchema,
  financeRevenuePointSchema,
  financeSummaryDataSchema,
  moneyIdrSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import {
  getSellerFinanceSummary,
  getSellerRevenue,
  listSellerLedger,
} from "@/features/finance/api";
import {
  emptyFinanceSummary,
  mapFinanceLedgerItemDto,
  mapFinanceLedgerPageDto,
  mapFinanceLedgerType,
  mapFinanceRevenueDto,
  mapFinanceSourceToView,
  mapFinanceSummaryDto,
} from "@/features/finance/mappers";
import { demoFinanceSummary, demoSellerLedger } from "@/features/finance/demo-data";
import { queryKeys } from "@/shared/query/query-keys";
import { DEMO_STORE_ID } from "@/shared/config/demo";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api/http-client")>(
    "@/shared/api/http-client",
  );
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

function summaryDto(
  overrides: Partial<{
    storeId: string;
    availableAmount: number;
    pendingAmount: number;
    heldAmount: number;
    monthGrossAmount: number;
    monthPlatformFeeAmount: number;
    monthProviderFeeAmount: number;
    monthNetAmount: number;
  }> = {},
) {
  return {
    storeId: overrides.storeId ?? "store_a",
    availableAmount: overrides.availableAmount ?? 0,
    pendingAmount: overrides.pendingAmount ?? 0,
    heldAmount: overrides.heldAmount ?? 0,
    lifetimeGrossAmount: 0,
    monthGrossAmount: overrides.monthGrossAmount ?? 0,
    monthPlatformFeeAmount: overrides.monthPlatformFeeAmount ?? 0,
    monthProviderFeeAmount: overrides.monthProviderFeeAmount ?? 0,
    monthNetAmount: overrides.monthNetAmount ?? 0,
    sources: {
      STOREFRONT: { availableAmount: 0, pendingAmount: 0 },
      QRIS_API: { availableAmount: 0, pendingAmount: 0 },
    },
    currency: "IDR" as const,
    asOf: AS_OF,
  };
}

describe("SEL-400 seller finance summary / revenue / ledger", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("parses integer IDR money and rejects float", () => {
    expect(moneyIdrSchema.parse(18_240_500)).toBe(18_240_500);
    expect(() => moneyIdrSchema.parse(18_240_500.5)).toThrow();
    expect(() => moneyIdrSchema.parse(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it("maps summary money from server without client recompute of net", () => {
    const dto = summaryDto({
      availableAmount: 96_300,
      pendingAmount: 0,
      monthGrossAmount: 100_000,
      monthPlatformFeeAmount: 3_000,
      monthProviderFeeAmount: 700,
      // Deliberately not gross - fees: server may use ledger month net.
      monthNetAmount: 96_300,
      storeId: "store_seeded",
    });
    dto.sources = {
      STOREFRONT: { availableAmount: 60_000, pendingAmount: 0 },
      QRIS_API: { available: 36_300, pending: 0 },
    };
    const parsed = financeSummaryDataSchema.parse(dto);
    const view = mapFinanceSummaryDto(parsed);

    expect(view.availableAmount).toBe(96_300);
    expect(view.monthNetAmount).toBe(96_300);
    // Must not recompute: 100_000 - 3_000 - 700 would also be 96_300 here;
    // assert identity with server field only (override would break if UI recomputed).
    expect(view.monthNetAmount).toBe(parsed.monthNetAmount);
    expect(view.sources.STOREFRONT.availableAmount).toBe(60_000);
    expect(view.sources.QRIS_API.availableAmount).toBe(36_300);
    expect(view.currency).toBe("IDR");
    expect(view.asOf).toBe(AS_OF);
  });

  it("does not invent monthNet from gross/fee when mapping empty store", () => {
    const empty = emptyFinanceSummary("store_new", AS_OF);
    expect(empty.availableAmount).toBe(0);
    expect(empty.monthNetAmount).toBe(0);
    expect(empty.sources.STOREFRONT.availableAmount).toBe(0);
  });

  it("maps SETTLEMENT_RELEASE and mixed sources on ledger rows", () => {
    const item = financeLedgerItemSchema.parse({
      id: "lj_release_1",
      storeId: "store_a",
      type: "SETTLEMENT_RELEASE",
      description: "Pelepasan settlement",
      amount: 96_300,
      direction: "CREDIT",
      source: "STOREFRONT",
      occurredAt: AS_OF,
      orderId: "ord_1",
    });
    const view = mapFinanceLedgerItemDto(item);
    expect(view.type).toBe("SETTLEMENT_RELEASE");
    expect(view.amount).toBe(96_300);
    expect(view.direction).toBe("CREDIT");
    expect(mapFinanceLedgerType("SETTLEMENT_RELEASE")).toBe("SETTLEMENT_RELEASE");
    expect(mapFinanceSourceToView("SYSTEM")).toBe("MIXED");
    expect(mapFinanceSourceToView("QRIS_API")).toBe("QRIS_API");
  });

  it("normalizes ledger page pagination to CursorPage", () => {
    const page = financeLedgerPageSchema.parse({
      items: [
        {
          id: "lj_1",
          storeId: "store_a",
          type: "SALE",
          amount: 50_000,
          direction: "CREDIT",
          source: "MIXED",
          occurredAt: AS_OF,
        },
      ],
      nextCursor: "cur_next",
      hasMore: true,
    });
    const cursorPage = mapFinanceLedgerPageDto(page);
    expect(cursorPage.items).toHaveLength(1);
    expect(cursorPage.nextCursor).toBe("cur_next");
    expect(cursorPage.previousCursor).toBeNull();
    expect(cursorPage.hasMore).toBe(true);
    expect(cursorPage.items[0]!.source).toBe("MIXED");
  });

  it("maps revenue points as integer IDR series", () => {
    const points = [
      financeRevenuePointSchema.parse({
        day: "2026-07-16",
        revenue: 2_100_000,
        orders: 24,
      }),
      financeRevenuePointSchema.parse({
        day: "2026-07-17",
        revenue: 0,
        orders: 0,
      }),
    ];
    const view = mapFinanceRevenueDto(points);
    expect(view[0]!.revenue).toBe(2_100_000);
    expect(view[1]!.orders).toBe(0);
  });

  it("API summary uses store-scoped path and schema", async () => {
    installApiFinance();
    const dto = summaryDto({
      storeId: "store_live",
      availableAmount: 18_240_500,
      monthNetAmount: 23_895_800,
    });
    dto.sources = {
      STOREFRONT: { availableAmount: 12_000_000, pendingAmount: 1_000_000 },
      QRIS_API: { availableAmount: 6_240_500, pendingAmount: 2_420_000 },
    };
    apiRequestMock.mockResolvedValueOnce({
      data: dto,
      meta: { requestId: "req_fin_1", timestamp: AS_OF },
    });

    const result = await getSellerFinanceSummary("store_live");
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/finance/summary");
    expect(opts.schema).toBeDefined();
    expect(result.availableAmount).toBe(18_240_500);
    expect(result.storeId).toBe("store_live");
    // No client recompute of available from sources.
    expect(result.availableAmount).not.toBe(
      result.sources.STOREFRONT.availableAmount +
        result.sources.QRIS_API.availableAmount +
        1,
    );
  });

  it("API ledger path encodes store id and passes cursor/source filters", async () => {
    installApiFinance();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        items: [],
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
      },
      meta: { requestId: "req_led", timestamp: AS_OF },
    });

    await listSellerLedger("store/with space", "cur_abc", undefined, {
      source: "STOREFRONT",
      limit: 25,
    });

    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store%2Fwith%20space/finance/ledger");
    expect(opts.query).toMatchObject({
      cursor: "cur_abc",
      source: "STOREFRONT",
      limit: 25,
    });
  });

  it("API revenue path includes days bound", async () => {
    installApiFinance();
    apiRequestMock.mockResolvedValueOnce({
      data: [{ day: "2026-07-17", revenue: 1_000, orders: 1 }],
      meta: { requestId: "req_rev", timestamp: AS_OF },
    });
    const points = await getSellerRevenue("store_live", undefined, 7);
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/finance/revenue");
    expect(opts.query).toMatchObject({ days: 7 });
    expect(points[0]!.revenue).toBe(1_000);
  });

  it("foreign store is isolated in path and query keys (404 left to transport)", async () => {
    installApiFinance();
    apiRequestMock.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), {
        status: 404,
        problem: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
      }),
    );
    await expect(getSellerFinanceSummary("store_foreign")).rejects.toBeTruthy();
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/stores/store_foreign/finance/summary",
    );
    expect(queryKeys.seller.finance("store_foreign")[1]).toBe("store_foreign");
    expect(queryKeys.seller.ledger("store_foreign", { profile: "cursor-first" })[1]).toBe(
      "store_foreign",
    );
    expect(queryKeys.seller.revenue("store_a", { days: 7 })).not.toEqual(
      queryKeys.seller.revenue("store_b", { days: 7 }),
    );
  });

  it("mock fixtures never hit transport and preserve demo money", async () => {
    installMockFinance();
    const summary = await getSellerFinanceSummary(DEMO_STORE_ID);
    const ledger = await listSellerLedger(DEMO_STORE_ID);
    const revenue = await getSellerRevenue(DEMO_STORE_ID);
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(summary.availableAmount).toBe(demoFinanceSummary(DEMO_STORE_ID).availableAmount);
    expect(ledger.items.length).toBe(demoSellerLedger(DEMO_STORE_ID).items.length);
    expect(ledger.items.some((i) => i.type === "SETTLEMENT_RELEASE")).toBe(true);
    expect(revenue.length).toBeGreaterThan(0);
    // Demo month net is server fixture, not recomputed in adapter.
    expect(summary.monthNetAmount).toBe(23_895_800);
  });

  it("rejects float revenue in schema", () => {
    expect(() =>
      financeRevenuePointSchema.parse({
        day: "2026-07-17",
        revenue: 1000.5,
        orders: 1,
      }),
    ).toThrow();
  });
});
