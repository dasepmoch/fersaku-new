import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminOrderDtoSchema,
  adminPaymentDtoSchema,
  adminPaymentMismatchDtoSchema,
  adminProviderLookupResultSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  getAdminOrder,
  getPayment,
  listAdminOrders,
  listAdminOrdersPage,
  listPaymentMismatches,
  listPayments,
  listPaymentsPage,
  mapAdminOrderDto,
  mapAdminOrderFeeDisplay,
  mapAdminPaymentDto,
  mapAdminPaymentMismatchDto,
  mapAdminPaymentStatusDisplay,
  providerLookupPayment,
  resendAdminOrderDelivery,
} from "@/features/admin/data";
import { queryKeys } from "@/shared/query/query-keys";

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

const AS_OF = "2026-07-17T12:00:00Z";

const sampleOrder = {
  id: "FRS-240712-1842",
  store: "Asep AI Tools",
  customer: "Budi",
  product: "AI Pack",
  gross: 129_000,
  totalFeeCharged: 4_500,
  status: "Paid",
  payment: "qris_2Yc91p",
  created: "12 Jul 2026",
  source: "STOREFRONT",
};

const samplePayment = {
  id: "qris_2Yc91p",
  provider: "Xendit",
  merchant: "Asep AI Tools",
  amount: 129_000,
  providerRef: "XND-9821041",
  status: "PAID",
  latency: "140ms",
  created: "12 Jul 2026",
  source: "STOREFRONT",
};

const sampleMismatch = {
  id: "mm_1",
  paymentIntentId: "qris_x",
  orderId: "FRS-1",
  merchant: "Store",
  amount: 50_000,
  provider: "Xendit",
  providerStatus: "PAID",
  localStatus: "Pending",
  age: "5m",
  attempts: 2,
  observedAt: "2026-07-17T12:00:00Z",
};

describe("ADM-300 admin orders/payments evidence", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps order DTO money server-authoritative; source STOREFRONT|QRIS_API", () => {
    const view = mapAdminOrderDto(
      adminOrderDtoSchema.parse({
        ...sampleOrder,
        gross: 1_250_500,
        totalFeeCharged: 12_000,
        source: "QRIS_API",
      }),
    );
    expect(view.gross).toBe(1_250_500);
    expect(view.totalFeeCharged).toBe(12_000);
    expect(view.source).toBe("QRIS_API");
  });

  it("maps payment DTO; UNKNOWN_OUTCOME is non-success display", () => {
    const view = mapAdminPaymentDto(
      adminPaymentDtoSchema.parse({
        ...samplePayment,
        status: "UNKNOWN_OUTCOME",
        amount: 99_000,
      }),
    );
    expect(view.amount).toBe(99_000);
    expect(view.status).toBe("Unknown outcome");
    expect(mapAdminPaymentStatusDisplay("PROVIDER_UNAVAILABLE")).toBe(
      "Provider unavailable",
    );
    expect(mapAdminPaymentStatusDisplay("Paid")).toBe("Paid");
  });

  it("order fee display never invents processing fee or unpaid net", () => {
    const unpaid = mapAdminOrderFeeDisplay(
      mapAdminOrderDto(
        adminOrderDtoSchema.parse({ ...sampleOrder, totalFeeCharged: 0 }),
      ),
    );
    expect(unpaid).toEqual({
      platformFee: 0,
      processingFee: 0,
      sellerNet: 0,
      totalFee: 0,
    });
    const paid = mapAdminOrderFeeDisplay(
      mapAdminOrderDto(
        adminOrderDtoSchema.parse({
          ...sampleOrder,
          gross: 100_000,
          totalFeeCharged: 3_000,
        }),
      ),
    );
    expect(paid.totalFee).toBe(3_000);
    expect(paid.sellerNet).toBe(97_000);
    expect(paid.processingFee).toBe(0);
  });

  it("maps mismatch evidence; amount from server only", () => {
    const view = mapAdminPaymentMismatchDto(
      adminPaymentMismatchDtoSchema.parse({
        ...sampleMismatch,
        amount: 77_000,
      }),
    );
    expect(view.amount).toBe(77_000);
    expect(view.providerStatus).toBe("PAID");
    expect(view.localStatus).toBe("Pending");
  });

  it("permission deny: orders.read / payments.read / fulfillment.force", () => {
    expect(claimsHavePermission(["buyers.read"], "orders.read")).toBe(false);
    expect(claimsHavePermission(["orders.read"], "payments.read")).toBe(false);
    expect(claimsHavePermission(["payments.read"], "fulfillment.force")).toBe(
      false,
    );
    expect(claimsHavePermission(["fulfillment.force"], "fulfillment.force")).toBe(
      true,
    );
    expect(claimsHavePermission(["*"], "payments.read")).toBe(true);
    expect(claimsHavePermission(null, "orders.read")).toBe(false);
  });

  it("mock path never hits transport for list/detail/commands", async () => {
    installMockAdmin();
    await listAdminOrders();
    await getAdminOrder("FRS-240712-1842");
    await listPayments();
    await getPayment("qris_2Yc91p");
    await listPaymentMismatches();
    await resendAdminOrderDelivery({
      orderId: "FRS-240712-1842",
      reason: "Buyer requested resend",
    });
    await providerLookupPayment({
      paymentIntentId: "qris_2Yc91p",
      reason: "Verify with provider",
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("API order list/detail paths", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [sampleOrder],
      meta: {
        requestId: "r1",
        timestamp: AS_OF,
        hasMore: false,
        nextCursor: null,
      },
    });
    const page = await listAdminOrdersPage({ limit: 50 });
    expect(page.items[0]?.id).toBe("FRS-240712-1842");
    expect(page.asOf).toBe(AS_OF);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/orders",
      expect.objectContaining({
        query: expect.objectContaining({ limit: 50 }),
      }),
    );

    apiRequestMock.mockResolvedValueOnce({
      data: sampleOrder,
      meta: { requestId: "r2", timestamp: AS_OF },
    });
    const detail = await getAdminOrder("FRS-240712-1842");
    expect(detail?.gross).toBe(129_000);
    expect(apiRequestMock).toHaveBeenLastCalledWith(
      "/v1/admin/orders/FRS-240712-1842",
      expect.any(Object),
    );
  });

  it("API payment list/detail + MIXED source empty without transport", async () => {
    installApiAdmin();
    const mixed = await listPaymentsPage({ source: "MIXED" });
    expect(mixed.items).toEqual([]);
    expect(apiRequestMock).not.toHaveBeenCalled();

    apiRequestMock.mockResolvedValueOnce({
      data: [samplePayment],
      meta: {
        requestId: "r3",
        timestamp: AS_OF,
        hasMore: false,
      },
    });
    const page = await listPaymentsPage({ source: "STOREFRONT" });
    expect(page.items[0]?.amount).toBe(129_000);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/payments",
      expect.objectContaining({
        query: expect.objectContaining({ source: "STOREFRONT" }),
      }),
    );

    apiRequestMock.mockResolvedValueOnce({
      data: samplePayment,
      meta: { requestId: "r4", timestamp: AS_OF },
    });
    const detail = await getPayment("qris_2Yc91p");
    expect(detail?.providerRef).toBe("XND-9821041");
  });

  it("API payment mismatches read-only list", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { items: [sampleMismatch] },
      meta: { requestId: "r5", timestamp: AS_OF },
    });
    const rows = await listPaymentMismatches();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(50_000);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/payment-mismatches",
      expect.any(Object),
    );
  });

  it("API resend + provider-lookup typed routes; no status mutation body", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { accepted: true },
      meta: { requestId: "resend_1", timestamp: AS_OF },
    });
    const resend = await resendAdminOrderDelivery({
      orderId: "FRS-240712-1842",
      reason: "Customer did not receive email",
      idempotencyKey: "idem-resend-1",
    });
    expect(resend.accepted).toBe(true);
    expect(apiRequestMock).toHaveBeenLastCalledWith(
      "/v1/admin/orders/FRS-240712-1842/delivery/resend",
      expect.objectContaining({
        method: "POST",
        body: {
          reason: "Customer did not receive email",
          idempotencyKey: "idem-resend-1",
        },
      }),
    );

    const lookupDto = adminProviderLookupResultSchema.parse({
      paymentIntentId: "qris_2Yc91p",
      localStatus: "PENDING",
      provider: "Xendit",
      providerReference: "XND-1",
      source: "STOREFRONT",
      lookup: "ACCEPTED",
      note: "lookup queued into finalization pipeline; no client-chosen status",
    });
    apiRequestMock.mockResolvedValueOnce({
      data: lookupDto,
      meta: { requestId: "lookup_1", timestamp: AS_OF },
    });
    const lookup = await providerLookupPayment({
      paymentIntentId: "qris_2Yc91p",
      reason: "Verify provider state",
    });
    expect(lookup.lookup).toBe("ACCEPTED");
    expect(lookup.requestId).toBe("lookup_1");
    const call = apiRequestMock.mock.calls.at(-1);
    expect(call?.[0]).toBe(
      "/v1/admin/payments/qris_2Yc91p/provider-lookup",
    );
    expect(call?.[1]?.body).toEqual({ reason: "Verify provider state" });
    expect(call?.[1]?.body).not.toHaveProperty("status");
  });

  it("query keys isolate order/payment/mismatch", () => {
    expect(queryKeys.admin.orders({ status: "Paid" })).toEqual([
      "admin",
      "orders",
      "bounded",
      { status: "Paid" },
    ]);
    expect(queryKeys.admin.order("o1")).toEqual(["admin", "orders", "o1"]);
    expect(queryKeys.admin.payments({ source: "QRIS_API" })).toEqual([
      "admin",
      "payments",
      "bounded",
      { source: "QRIS_API" },
    ]);
    expect(queryKeys.admin.payment("pi1")).toEqual([
      "admin",
      "payments",
      "pi1",
    ]);
    expect(queryKeys.admin.paymentMismatches()).toEqual([
      "admin",
      "payment-mismatches",
    ]);
  });

  it("rejects fractional money on payment/order DTOs", () => {
    expect(() =>
      adminPaymentDtoSchema.parse({ ...samplePayment, amount: 1.5 }),
    ).toThrow();
    expect(() =>
      adminOrderDtoSchema.parse({ ...sampleOrder, gross: 10.25 }),
    ).toThrow();
  });
});
