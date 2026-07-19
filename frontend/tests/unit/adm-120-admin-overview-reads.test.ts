import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminMerchantDtoSchema,
  adminOverviewDataSchema,
  adminPlatformVolumeDataSchema,
  moneyIdrSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  getAdminOverview,
  getPlatformVolume,
  listMerchants,
  listMerchantsPage,
} from "@/features/admin/data";
import {
  formatSuccessRateBps,
  mapAdminMerchantDto,
  mapAdminOrderDto,
  mapAdminOverviewDto,
  mapAdminPaymentDto,
  mapAdminWithdrawalDto,
  mapPlatformVolumeBuckets,
  normalizeAdminListFilters,
  overviewMetricLabels,
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

const AS_OF = "2026-07-17T09:00:00Z";

function overviewDto(
  overrides: Partial<{
    grossVolumePaidIdr: number;
    platformFeePaidIdr: number;
    paymentSuccessRateBps: number;
    pendingWithdrawalCount: number;
  }> = {},
) {
  return {
    merchantCount: 10,
    buyerCount: 20,
    orderCount: 30,
    paymentCount: 25,
    pendingWithdrawalCount: overrides.pendingWithdrawalCount ?? 0,
    openKycCount: 0,
    grossVolumePaidIdr: overrides.grossVolumePaidIdr ?? 0,
    platformFeePaidIdr: overrides.platformFeePaidIdr ?? 0,
    paymentSuccessRateBps: overrides.paymentSuccessRateBps ?? 0,
  };
}

describe("ADM-120 admin overview/read foundation", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps overview money from server without fabricating revenue", () => {
    const dto = overviewDto({
      grossVolumePaidIdr: 84_200_000,
      platformFeePaidIdr: 3_180_000,
      paymentSuccessRateBps: 9684,
      pendingWithdrawalCount: 12,
    });
    const parsed = adminOverviewDataSchema.parse(dto);
    const view = mapAdminOverviewDto(parsed, AS_OF);
    expect(view.grossVolumePaidIdr).toBe(84_200_000);
    expect(view.platformFeePaidIdr).toBe(3_180_000);
    expect(view.paymentSuccessRateBps).toBe(9684);
    expect(view.asOf).toBe(AS_OF);
    expect(formatSuccessRateBps(view.paymentSuccessRateBps)).toBe("96,84%");
    const labels = overviewMetricLabels(view);
    expect(labels.grossVolume).toContain("Rp");
    expect(labels.pendingWithdrawals).toBe("12");
  });

  it("rejects fractional money on overview schema", () => {
    expect(() =>
      adminOverviewDataSchema.parse(
        overviewDto({ grossVolumePaidIdr: 100.5 as unknown as number }),
      ),
    ).toThrow();
    expect(moneyIdrSchema.safeParse(1.5).success).toBe(false);
    expect(moneyIdrSchema.safeParse(100).success).toBe(true);
  });

  it("maps platform volume buckets with relative height only", () => {
    const buckets = [0, 50_000, 100_000, 25_000];
    const series = mapPlatformVolumeBuckets(
      adminPlatformVolumeDataSchema.parse(buckets),
      AS_OF,
    );
    expect(series.points).toHaveLength(4);
    expect(series.points[0]?.amountIdr).toBe(0);
    expect(series.points[2]?.amountIdr).toBe(100_000);
    expect(series.points[2]?.heightPct).toBe(100);
    expect(series.asOf).toBe(AS_OF);
  });

  it("maps merchant/order/payment/withdrawal money fields from DTO", () => {
    const merchant = mapAdminMerchantDto(
      adminMerchantDtoSchema.parse({
        id: "m1",
        name: "Store",
        owner: "Owner",
        email: "a@b.c",
        volume: 1_000_000,
        orders: 3,
        risk: "Low",
        status: "Active",
        joined: "1 Jan 2026",
        apiAccess: "Enabled",
      }),
    );
    expect(merchant.volume).toBe(1_000_000);

    const order = mapAdminOrderDto({
      id: "o1",
      store: "S",
      customer: "C",
      product: "P",
      gross: 50_000,
      totalFeeCharged: 1_500,
      status: "Paid",
      payment: "QRIS",
      created: "1 Jan",
      source: "STOREFRONT",
    });
    expect(order.gross).toBe(50_000);
    expect(order.totalFeeCharged).toBe(1_500);

    const payment = mapAdminPaymentDto({
      id: "p1",
      provider: "Xendit",
      merchant: "M",
      amount: 50_000,
      providerRef: "xr_1",
      status: "PAID",
      latency: "12ms",
      created: "1 Jan",
      source: "QRIS_API",
    });
    expect(payment.amount).toBe(50_000);
    expect(payment.source).toBe("QRIS_API");

    const withdrawal = mapAdminWithdrawalDto({
      id: "w1",
      merchant: "M",
      owner: "O",
      amount: 2_000_000,
      bank: "BCA",
      account: "****1234",
      risk: "Low",
      status: "Pending",
      requested: "1 Jan",
      source: "MIXED",
      providerProcessingFee: 2_500,
      providerFeeStatus: "VERIFIED",
    });
    expect(withdrawal.amount).toBe(2_000_000);
    expect(withdrawal.providerProcessingFee).toBe(2_500);
    expect(withdrawal.source).toBe("MIXED");
  });

  it("permission deny path: missing admin.dashboard.read fails closed", () => {
    expect(
      claimsHavePermission(
        ["merchants.read", "orders.read"],
        "admin.dashboard.read",
      ),
    ).toBe(false);
    expect(claimsHavePermission([], "admin.dashboard.read")).toBe(false);
    expect(claimsHavePermission(null, "admin.dashboard.read")).toBe(false);
    expect(
      claimsHavePermission(["admin.dashboard.read"], "admin.dashboard.read"),
    ).toBe(true);
    expect(claimsHavePermission(["*"], "admin.dashboard.read")).toBe(true);
    expect(claimsHavePermission(["*"], "not.a.real.code")).toBe(false);
  });

  it("query keys include normalized filters and overview key", () => {
    expect(queryKeys.admin.overview()).toEqual(["admin", "overview"]);
    const a = queryKeys.admin.merchants({ q: "asep", limit: 50 });
    const b = queryKeys.admin.merchants({ q: "other", limit: 50 });
    expect(a).not.toEqual(b);
    expect(a).toContain("bounded");
    expect(normalizeAdminListFilters({ q: "  x  ", limit: 200 })).toEqual({
      q: "x",
      limit: 100,
    });
    expect(normalizeAdminListFilters({})).toEqual({});
  });

  it("API overview adapter uses schema and asOf from meta", async () => {
    installApiAdmin();
    const dto = overviewDto({
      grossVolumePaidIdr: 10_000,
      platformFeePaidIdr: 500,
      paymentSuccessRateBps: 9000,
    });
    apiRequestMock.mockResolvedValueOnce({
      data: dto,
      meta: { requestId: "req_ov", timestamp: AS_OF },
    });
    const result = await getAdminOverview();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/admin/overview");
    expect(opts.schema).toBeDefined();
    expect(result.grossVolumePaidIdr).toBe(10_000);
    expect(result.asOf).toBe(AS_OF);
  });

  it("API platform-volume maps 24 buckets", async () => {
    installApiAdmin();
    const buckets = Array.from({ length: 24 }, (_, i) => i * 1000);
    apiRequestMock.mockResolvedValueOnce({
      data: buckets,
      meta: { requestId: "req_vol", timestamp: AS_OF },
    });
    const series = await getPlatformVolume();
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/overview/platform-volume",
    );
    expect(series.points).toHaveLength(24);
    expect(series.points[23]?.amountIdr).toBe(23_000);
  });

  it("mock path never hits transport for overview/merchants", async () => {
    installMockAdmin();
    const overview = await getAdminOverview();
    const volume = await getPlatformVolume();
    const merchants = await listMerchants();
    const page = await listMerchantsPage({ limit: 3 });
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(overview.grossVolumePaidIdr).toBe(84_200_000);
    expect(volume.points.length).toBeGreaterThan(0);
    expect(merchants.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(3);
    expect(page.asOf).toBeTruthy();
  });

  it("API merchant list uses bounded schema and maps volume money", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [
        {
          id: "m_live",
          name: "Live Store",
          owner: "Owner",
          email: "o@x.id",
          volume: 9_999_000,
          orders: 12,
          risk: "Low",
          status: "Active",
          joined: "1 Jan 2026",
          apiAccess: "Enabled",
        },
      ],
      meta: {
        requestId: "req_m",
        timestamp: AS_OF,
        hasMore: false,
      },
    });
    const rows = await listMerchants({ q: "Live", limit: 50 });
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/merchants");
    expect(apiRequestMock.mock.calls[0]![1].query).toMatchObject({
      q: "Live",
      limit: 50,
    });
    expect(rows[0]?.volume).toBe(9_999_000);
    expect(rows[0]?.id).toBe("m_live");
  });
});
