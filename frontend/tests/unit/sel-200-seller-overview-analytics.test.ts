import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsOverviewDataSchema,
  analyticsTrafficPageSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import {
  getSellerAnalyticsOverview,
  getSellerAnalyticsTraffic,
} from "@/features/seller/analytics/api";
import {
  buildAnalyticsDateRange,
  emptyAnalyticsOverview,
  emptyTrafficAnalytics,
  formatConversionBps,
  formatCountId,
  mapAnalyticsOverviewDto,
  mapTrafficPageToAnalytics,
  rangeDaysFromOverviewLabel,
  rangeDaysFromTrafficLabel,
  wireChannelFromUiLabel,
} from "@/features/seller/analytics/mappers";
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

function installApiSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const AS_OF = "2026-07-17T07:00:00Z";

function overviewDto(
  overrides: Partial<{
    storeId: string;
    sessions: number;
    orders: number;
    grossIdr: number;
    conversionRateBps: number;
  }> = {},
) {
  return {
    storeId: overrides.storeId ?? "store_a",
    timezone: "Asia/Jakarta",
    from: "2026-07-10",
    to: "2026-07-16",
    sessions: overrides.sessions ?? 0,
    pageViews: 0,
    checkouts: 0,
    orders: overrides.orders ?? 0,
    grossIdr: overrides.grossIdr ?? 0,
    conversionRateBps: overrides.conversionRateBps ?? 0,
    channels: [] as Array<{
      channel?: string;
      sessions?: number;
      orders?: number;
      grossIdr?: number;
    }>,
  };
}

describe("SEL-200 seller overview analytics", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("parses empty overview metrics without fabricating revenue", () => {
    const dto = overviewDto();
    const parsed = analyticsOverviewDataSchema.parse(dto);
    const view = mapAnalyticsOverviewDto(parsed, AS_OF);
    expect(view.grossIdr).toBe(0);
    expect(view.orders).toBe(0);
    expect(view.conversionRateBps).toBe(0);
    expect(view.sessions).toBe(0);
    expect(view.asOf).toBe(AS_OF);
    expect(formatConversionBps(0)).toBe("0%");
    expect(formatCountId(0)).toBe("0");
  });

  it("maps overview aggregates from server (not UI-derived)", () => {
    const dto = overviewDto({
      sessions: 1000,
      orders: 84,
      grossIdr: 24_860_000,
      conversionRateBps: 840,
    });
    dto.channels = [
      { channel: "social", sessions: 600, orders: 50, grossIdr: 15_000_000 },
    ];
    const view = mapAnalyticsOverviewDto(
      analyticsOverviewDataSchema.parse(dto),
      AS_OF,
    );
    expect(view.grossIdr).toBe(24_860_000);
    expect(view.orders).toBe(84);
    expect(formatConversionBps(view.conversionRateBps)).toBe("8,4%");
    expect(view.channels).toHaveLength(1);
    expect(view.channels[0]?.channel).toBe("social");
  });

  it("empty helpers stay zeroed for new store", () => {
    const range = buildAnalyticsDateRange(
      7,
      "UTC",
      new Date("2026-07-17T00:00:00Z"),
    );
    const emptyOv = emptyAnalyticsOverview("store_new", range, AS_OF);
    const emptyTr = emptyTrafficAnalytics("store_new", range, "all", AS_OF);
    expect(emptyOv.orders).toBe(0);
    expect(emptyOv.grossIdr).toBe(0);
    expect(emptyTr.rows).toEqual([]);
    expect(emptyTr.metrics.attributedClicks).toBe(0);
    expect(emptyTr.metrics.bestCampaign).toBe("—");
  });

  it("query keys are store-scoped and include range/channel", () => {
    const a = queryKeys.seller.analyticsOverview("store_a", {
      from: "2026-07-01",
      to: "2026-07-07",
      timezone: "Asia/Jakarta",
      days: 7,
    });
    const b = queryKeys.seller.analyticsOverview("store_b", {
      from: "2026-07-01",
      to: "2026-07-07",
      timezone: "Asia/Jakarta",
      days: 7,
    });
    const t = queryKeys.seller.analyticsTraffic("store_a", {
      from: "2026-07-01",
      to: "2026-07-30",
      channel: "social",
      days: 30,
    });
    expect(a[1]).toBe("store_a");
    expect(b[1]).toBe("store_b");
    expect(a).not.toEqual(b);
    expect(t).toContain("store_a");
    expect(t[t.length - 1]).toMatchObject({ channel: "social" });
    expect(queryKeys.seller.revenue("store_a", { days: 7 })).not.toEqual(
      queryKeys.seller.revenue("store_a", { days: 30 }),
    );
  });

  it("maps traffic rows aggregated by channel with store scope", () => {
    const page = analyticsTrafficPageSchema.parse({
      items: [
        {
          day: "2026-07-15",
          channel: "social",
          sessions: 100,
          pageViews: 200,
          checkouts: 10,
          orders: 5,
          grossIdr: 500_000,
        },
        {
          day: "2026-07-16",
          channel: "social",
          sessions: 50,
          pageViews: 80,
          checkouts: 4,
          orders: 2,
          grossIdr: 200_000,
        },
        {
          day: "2026-07-16",
          channel: "organic",
          sessions: 40,
          pageViews: 60,
          checkouts: 3,
          orders: 1,
          grossIdr: 100_000,
        },
      ],
      hasMore: false,
      timezone: "Asia/Jakarta",
      from: "2026-07-01",
      to: "2026-07-16",
    });
    const view = mapTrafficPageToAnalytics("store_x", page, "all", AS_OF);
    expect(view.storeId).toBe("store_x");
    expect(view.rows).toHaveLength(2);
    const social = view.rows.find((r) => r.key === "social");
    expect(social?.clicks).toBe(150);
    expect(social?.sales).toBe(7);
    expect(social?.revenueIdr).toBe(700_000);
    expect(view.metrics.attributedClicks).toBe(190);
    expect(view.metrics.attributedSales).toBe(8);
    expect(view.asOf).toBe(AS_OF);
  });

  it("range labels map to server day bounds", () => {
    expect(rangeDaysFromOverviewLabel("7 hari")).toBe(7);
    expect(rangeDaysFromOverviewLabel("30 hari")).toBe(30);
    expect(rangeDaysFromTrafficLabel("90 hari")).toBe(90);
    expect(wireChannelFromUiLabel("Semua channel")).toBe("all");
    expect(wireChannelFromUiLabel("Social")).toBe("social");
    expect(wireChannelFromUiLabel("Organic")).toBe("organic");
    expect(wireChannelFromUiLabel("Video")).toBe("all");

    const range = buildAnalyticsDateRange(
      7,
      "UTC",
      new Date("2026-07-17T12:00:00Z"),
    );
    expect(range.to).toBe("2026-07-17");
    expect(range.from).toBe("2026-07-11");
    expect(range.days).toBe(7);
  });

  it("API adapter calls store-scoped overview with from/to/timezone", async () => {
    installApiSeller();
    const dto = overviewDto({
      storeId: "store_live",
      sessions: 10,
      orders: 2,
      grossIdr: 100_000,
      conversionRateBps: 2000,
    });
    apiRequestMock.mockResolvedValueOnce({
      data: dto,
      meta: { requestId: "req_1", timestamp: AS_OF },
    });

    const range = buildAnalyticsDateRange(
      7,
      "Asia/Jakarta",
      new Date("2026-07-17T00:00:00+07:00"),
    );
    const result = await getSellerAnalyticsOverview({
      storeId: "store_live",
      range,
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/analytics/overview");
    expect(opts.query).toMatchObject({
      from: range.from,
      to: range.to,
      timezone: "Asia/Jakarta",
    });
    expect(result.storeId).toBe("store_live");
    expect(result.grossIdr).toBe(100_000);
    expect(result.asOf).toBe(AS_OF);
  });

  it("API traffic adapter includes channel filter and store path", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        items: [],
        hasMore: false,
        timezone: "Asia/Jakarta",
        from: "2026-07-01",
        to: "2026-07-16",
      },
      meta: { requestId: "req_2", timestamp: AS_OF },
    });

    const range = {
      from: "2026-07-01",
      to: "2026-07-16",
      timezone: "Asia/Jakarta" as const,
      days: 16,
    };
    const result = await getSellerAnalyticsTraffic({
      storeId: "store_live",
      range,
      channel: "social",
    });

    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/analytics/traffic");
    expect(opts.query).toMatchObject({
      channel: "social",
      from: "2026-07-01",
      to: "2026-07-16",
    });
    expect(result.rows).toEqual([]);
    expect(result.metrics.attributedClicks).toBe(0);
  });

  it("mock fixtures never hit transport", async () => {
    installMockSeller();
    const overview = await getSellerAnalyticsOverview({
      storeId: "demo_store",
    });
    const traffic = await getSellerAnalyticsTraffic({
      storeId: "demo_store",
      channel: "all",
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(overview.orders).toBe(312);
    expect(overview.grossIdr).toBe(24_860_000);
    expect(traffic.metrics.attributedClicks).toBe(9762);
    expect(traffic.rows.length).toBeGreaterThan(0);
  });

  it("foreign store path is encoded and isolated in keys", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: overviewDto({ storeId: "store_other" }),
      meta: { requestId: "req_3", timestamp: AS_OF },
    });
    await getSellerAnalyticsOverview({
      storeId: "store_other",
      range: {
        from: "2026-07-01",
        to: "2026-07-07",
        timezone: "UTC",
        days: 7,
      },
    });
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/stores/store_other/analytics/overview",
    );
    expect(
      queryKeys.seller.analyticsOverview("store_other", { days: 7 })[1],
    ).toBe("store_other");
  });
});
