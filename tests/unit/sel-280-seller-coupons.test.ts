import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  couponCreateRequestSchema,
  couponDtoSchema,
  couponListEnvelopeSchema,
  couponPatchRequestSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/http-client";
import {
  computeCouponListMetrics,
  formatCouponDiscountLabel,
  formatCouponUsageLabel,
  mapCouponDto,
  mapCouponStateToStatus,
  toCreateCouponRequestBody,
  toPatchCouponRequestBody,
} from "@/features/seller/coupons/mappers";
import type { SellerCoupon } from "@/features/seller/coupons/contracts";
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

const meta = {
  requestId: "req_sel280",
  timestamp: "2026-07-17T10:00:00Z",
};

const activeCoupon = {
  id: "cpn_live_01",
  storeId: "store_live",
  merchantId: "mrc_live",
  code: "LAUNCH20",
  discountKind: "PERCENT" as const,
  discountValue: 2000,
  discountPercent: 20,
  minMerchandise: 0,
  maxTotalUses: 250,
  state: "ACTIVE" as const,
  scope: "ALL_PRODUCTS" as const,
  version: 2,
  policyVersion: 1,
  reservedCount: 3,
  redeemedCount: 125,
  usageCount: 128,
  productIds: [] as string[],
  endsAt: "2026-07-20T17:00:00Z",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-17T00:00:00Z",
};

const fixedCoupon = {
  ...activeCoupon,
  id: "cpn_live_02",
  code: "HEMAT50K",
  discountKind: "FIXED_IDR" as const,
  discountValue: 50_000,
  discountPercent: undefined,
  maxTotalUses: 100,
  usageCount: 42,
  reservedCount: 0,
  redeemedCount: 42,
  state: "ACTIVE" as const,
};

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

describe("SEL-280 schemas", () => {
  it("accepts coupon list envelope", () => {
    expect(couponDtoSchema.safeParse(activeCoupon).success).toBe(true);
    const env = couponListEnvelopeSchema.safeParse({
      data: [activeCoupon, fixedCoupon],
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("create request accepts percent display or fixed IDR", () => {
    expect(
      couponCreateRequestSchema.safeParse({
        code: "SAVE20",
        discountKind: "percentage",
        discountValue: 20,
      }).success,
    ).toBe(true);
    expect(
      couponCreateRequestSchema.safeParse({
        code: "SAVE50K",
        discountKind: "FIXED_IDR",
        discountValue: 50_000,
        maxTotalUses: 100,
      }).success,
    ).toBe(true);
    expect(
      couponCreateRequestSchema.safeParse({
        code: "X",
        discountKind: "percentage",
        discountValue: 12.5,
      }).success,
    ).toBe(false);
  });

  it("patch requires expectedVersion; no status field", () => {
    expect(
      couponPatchRequestSchema.safeParse({
        expectedVersion: 2,
        maxTotalUses: 300,
      }).success,
    ).toBe(true);
    expect(couponPatchRequestSchema.safeParse({ code: "X" }).success).toBe(
      false,
    );
    const parsed = couponPatchRequestSchema.safeParse({
      expectedVersion: 1,
      state: "ACTIVE",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(
        Object.prototype.hasOwnProperty.call(parsed.data, "state"),
      ).toBe(false);
    }
  });
});

describe("SEL-280 mappers", () => {
  it("maps DTO to list view labels", () => {
    const view = mapCouponDto(activeCoupon);
    expect(view.code).toBe("LAUNCH20");
    expect(view.discountLabel).toBe("20%");
    expect(view.usageLabel).toBe("128 / 250");
    expect(view.status).toBe("Active");
    expect(view.state).toBe("ACTIVE");
    expect(view.version).toBe(2);
  });

  it("maps fixed IDR discount with integer money", () => {
    const view = mapCouponDto(fixedCoupon);
    expect(view.discountLabel).toBe("Rp50.000");
    expect(view.usageLabel).toBe("42 / 100");
  });

  it("maps lifecycle states to Status chips", () => {
    expect(mapCouponStateToStatus("DRAFT")).toBe("Draft");
    expect(mapCouponStateToStatus("ACTIVE")).toBe("Active");
    expect(mapCouponStateToStatus("PAUSED")).toBe("Paused");
    expect(mapCouponStateToStatus("EXPIRED")).toBe("Expired");
    expect(mapCouponStateToStatus("ARCHIVED")).toBe("Archived");
  });

  it("format helpers stay integer-safe", () => {
    expect(
      formatCouponDiscountLabel({
        discountKind: "PERCENT",
        discountValue: 1500,
      }),
    ).toBe("15%");
    expect(
      formatCouponDiscountLabel({
        discountKind: "FIXED_IDR",
        discountValue: 100_000,
      }),
    ).toBe("Rp100.000");
    expect(formatCouponUsageLabel(7)).toBe("7");
    expect(formatCouponUsageLabel(7, 25)).toBe("7 / 25");
  });

  it("list metrics use server usageCount; never invent discount total", () => {
    const items: SellerCoupon[] = [
      mapCouponDto(activeCoupon),
      mapCouponDto({ ...fixedCoupon, state: "EXPIRED" }),
      mapCouponDto({ ...activeCoupon, id: "x", state: "PAUSED", usageCount: 0 }),
    ];
    const m = computeCouponListMetrics(items);
    expect(m.activeCount).toBe(1);
    expect(m.totalCount).toBe(3);
    expect(m.ordersWithCoupon).toBe(128 + 42 + 0);
    expect(m.totalDiscountLabel).toBe("—");
  });

  it("create body normalizes code and discount kind", () => {
    const body = toCreateCouponRequestBody({
      code: " launch20 ",
      discountKind: "percentage",
      discountValue: 20,
      maxTotalUses: 250,
      scope: "Semua produk",
    });
    expect(body.code).toBe("LAUNCH20");
    expect(body.discountKind).toBe("PERCENT");
    expect(body.discountValue).toBe(20);
    expect(body.scope).toBe("ALL_PRODUCTS");
  });

  it("patch body carries expectedVersion only for concurrency", () => {
    const body = toPatchCouponRequestBody({
      expectedVersion: 3,
      endsAt: "2026-08-01T00:00:00Z",
    });
    expect(body.expectedVersion).toBe(3);
    expect(body.endsAt).toBe("2026-08-01T00:00:00Z");
  });
});

describe("SEL-280 query keys", () => {
  it("includes store id for list and detail", () => {
    expect(queryKeys.seller.coupons("store_a")).toEqual([
      "seller",
      "store_a",
      "coupons",
    ]);
    expect(queryKeys.seller.coupon("store_a", "cpn_1")).toEqual([
      "seller",
      "store_a",
      "coupons",
      "cpn_1",
    ]);
    expect(queryKeys.seller.coupons("store_a")).not.toEqual(
      queryKeys.seller.coupons("store_b"),
    );
  });
});

describe("SEL-280 api adapters", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("mock path returns fixtures without network", async () => {
    installMockSeller();
    const {
      listSellerCoupons,
      createSellerCoupon,
      activateSellerCoupon,
    } = await import("@/features/seller/coupons/api");
    const list = await listSellerCoupons(DEMO_STORE_ID);
    const created = await createSellerCoupon(DEMO_STORE_ID, {
      code: "NEW10",
      discountKind: "percentage",
      discountValue: 10,
    });
    const activated = await activateSellerCoupon(DEMO_STORE_ID, created.id);
    expect(list.length).toBeGreaterThan(0);
    expect(created.state).toBe("DRAFT");
    expect(activated.state).toBe("ACTIVE");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list uses store-scoped path and maps rows", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [activeCoupon, fixedCoupon],
      meta,
    });
    const { listSellerCoupons } = await import(
      "@/features/seller/coupons/api"
    );
    const list = await listSellerCoupons("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/coupons",
      expect.objectContaining({
        schema: couponListEnvelopeSchema,
      }),
    );
    expect(list).toHaveLength(2);
    expect(list[0]?.discountLabel).toBe("20%");
    expect(list[1]?.discountLabel).toBe("Rp50.000");
  });

  it("foreign store list rethrows resource_not_found (safe 404)", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      }),
    );
    const { listSellerCoupons } = await import(
      "@/features/seller/coupons/api"
    );
    await expect(listSellerCoupons("store_foreign")).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("foreign coupon detail returns null (safe 404)", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      }),
    );
    const { getSellerCoupon } = await import("@/features/seller/coupons/api");
    await expect(
      getSellerCoupon("store_live", "cpn_other"),
    ).resolves.toBeNull();
  });

  it("create POST sends integer body + idempotency key", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...activeCoupon, state: "DRAFT", version: 1, usageCount: 0 },
      meta,
    });
    const { createSellerCoupon } = await import(
      "@/features/seller/coupons/api"
    );
    await createSellerCoupon("store_live", {
      code: "launch20",
      discountKind: "percentage",
      discountValue: 20,
      maxTotalUses: 250,
      idempotencyKey: "idem_test_create",
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/coupons",
      expect.objectContaining({
        method: "POST",
        idempotencyKey: "idem_test_create",
        body: expect.objectContaining({
          code: "LAUNCH20",
          discountKind: "PERCENT",
          discountValue: 20,
          maxTotalUses: 250,
        }),
      }),
    );
  });

  it("lifecycle transitions call explicit activate/pause/archive", async () => {
    installApiSeller();
    const envelope = { data: activeCoupon, meta };
    apiRequestMock
      .mockResolvedValueOnce({
        data: { ...activeCoupon, state: "ACTIVE" },
        meta,
      })
      .mockResolvedValueOnce({
        data: { ...activeCoupon, state: "PAUSED" },
        meta,
      })
      .mockResolvedValueOnce({
        data: { ...activeCoupon, state: "ARCHIVED" },
        meta,
      });
    const {
      activateSellerCoupon,
      pauseSellerCoupon,
      archiveSellerCoupon,
    } = await import("@/features/seller/coupons/api");
    expect((await activateSellerCoupon("store_live", "cpn_live_01")).state).toBe(
      "ACTIVE",
    );
    expect((await pauseSellerCoupon("store_live", "cpn_live_01")).state).toBe(
      "PAUSED",
    );
    expect((await archiveSellerCoupon("store_live", "cpn_live_01")).state).toBe(
      "ARCHIVED",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/v1/stores/store_live/coupons/cpn_live_01/activate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/v1/stores/store_live/coupons/cpn_live_01/pause",
      expect.objectContaining({ method: "POST" }),
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/v1/stores/store_live/coupons/cpn_live_01/archive",
      expect.objectContaining({ method: "POST" }),
    );
    void envelope;
  });

  it("patch sends expectedVersion for optimistic concurrency", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...activeCoupon, version: 3 },
      meta,
    });
    const { patchSellerCoupon } = await import(
      "@/features/seller/coupons/api"
    );
    const result = await patchSellerCoupon("store_live", "cpn_live_01", {
      expectedVersion: 2,
      maxTotalUses: 300,
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/coupons/cpn_live_01",
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          expectedVersion: 2,
          maxTotalUses: 300,
        }),
      }),
    );
    expect(result.version).toBe(3);
  });

  it("stale patch version conflict rethrows", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(409, {
        code: "CONFLICT",
        message: "Version conflict",
      }),
    );
    const { patchSellerCoupon } = await import(
      "@/features/seller/coupons/api"
    );
    await expect(
      patchSellerCoupon("store_live", "cpn_live_01", {
        expectedVersion: 1,
        code: "X",
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
