import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SELLER_ORDER_DEFAULT_PAGE_SIZE,
  sellerOrderDetailDtoSchema,
  sellerOrderListEnvelopeSchema,
  sellerOrderSummaryDtoSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import {
  applySellerOrderListFilters,
  assertNoDeliverySecretsInSellerOrder,
  initialsFromName,
  mapSellerOrderDetailDto,
  mapSellerOrderListEnvelope,
  mapSellerOrderPaymentStatus,
  mapSellerOrderSummaryDto,
  mapStatusTabToPaymentStatus,
} from "@/features/orders/mappers";
import type { SellerOrder } from "@/features/orders/contracts";
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
  requestId: "req_sel250",
  timestamp: "2026-07-17T10:00:00Z",
  page: 1,
  pageSize: 20,
  totalCount: 1,
  pageCount: 1,
};

const listRow = {
  orderId: "01HQ0ORDER000000000000001",
  orderNumber: "FRS-240712-1842",
  storeId: "store_live",
  merchantId: "merch_1",
  buyerName: "Nadia Putri",
  buyerEmail: "nadia@studio.id",
  productTitle: "AI Prompt Pack",
  paymentStatus: "PAID",
  source: "STOREFRONT",
  currency: "IDR",
  grossIdr: 79_000,
  feeIdr: 3_070,
  merchantNetIdr: 75_930,
  deliveryStatus: "ACTIVE",
  paidAt: "2026-07-12T07:33:00Z",
  createdAt: "2026-07-12T07:32:00Z",
};

const detailDto = {
  orderId: "01HQ0ORDER000000000000001",
  orderNumber: "FRS-240712-1842",
  storeId: "store_live",
  merchantId: "merch_1",
  buyerName: "Nadia Putri",
  buyerEmail: "nadia@studio.id",
  paymentStatus: "PAID",
  source: "STOREFRONT",
  currency: "IDR",
  subtotalIdr: 79_000,
  discountIdr: 0,
  tipIdr: 0,
  feeIdr: 3_070,
  grossIdr: 79_000,
  merchantNetIdr: 75_930,
  paidAt: "2026-07-12T07:33:00Z",
  createdAt: "2026-07-12T07:32:00Z",
  productTitle: "AI Prompt Pack",
  items: [
    {
      orderItemId: "oi_1",
      productId: "prod_01",
      productTitle: "AI Prompt Pack",
      productType: "download",
      productVersion: "v3.0",
      unitPriceIdr: 79_000,
      quantity: 1,
      lineTotalIdr: 79_000,
      deliveryKind: "DOWNLOAD",
    },
  ],
  grants: [
    {
      grantId: "grant_1",
      orderItemId: "oi_1",
      productId: "prod_01",
      deliveryKind: "DOWNLOAD",
      status: "ACTIVE",
      accessCount: 1,
      maxAccesses: 5,
      activatedAt: "2026-07-12T07:33:23Z",
      createdAt: "2026-07-12T07:33:23Z",
    },
  ],
  payment: {
    paymentIntentId: "pi_1",
    provider: "Xendit",
    providerReference: "qris_2Yc91p",
    status: "PAID",
    source: "STOREFRONT",
    amountIdr: 79_000,
    paidLate: false,
  },
  timeline: [
    { label: "Pesanan dibuat", at: "2026-07-12T07:32:00Z" },
    { label: "Pembayaran terkonfirmasi", at: "2026-07-12T07:33:00Z" },
    { label: "Delivery berhasil", at: "2026-07-12T07:33:23Z" },
  ],
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

function viewOrder(overrides: Partial<SellerOrder> = {}): SellerOrder {
  return {
    id: "FRS-1",
    storeId: "store_live",
    customer: "A",
    email: "a@x.id",
    product: "P",
    amount: 10_000,
    status: "Paid",
    date: "now",
    avatar: "A",
    ...overrides,
  };
}

describe("SEL-250 schemas", () => {
  it("accepts summary + numbered list envelope", () => {
    expect(sellerOrderSummaryDtoSchema.safeParse(listRow).success).toBe(true);
    const env = sellerOrderListEnvelopeSchema.safeParse({
      data: [listRow],
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("accepts detail without secret fields", () => {
    expect(sellerOrderDetailDtoSchema.safeParse(detailDto).success).toBe(true);
  });

  it("rejects fractional money", () => {
    expect(
      sellerOrderSummaryDtoSchema.safeParse({
        ...listRow,
        grossIdr: 79_000.5,
      }).success,
    ).toBe(false);
  });

  it("documents default page size", () => {
    expect(SELLER_ORDER_DEFAULT_PAGE_SIZE).toBe(20);
  });
});

describe("SEL-250 mappers", () => {
  it("maps payment status exhaustively for UI badges", () => {
    expect(mapSellerOrderPaymentStatus("PAID")).toBe("Paid");
    expect(mapSellerOrderPaymentStatus("PENDING")).toBe("Pending");
    expect(mapSellerOrderPaymentStatus("UNPAID")).toBe("Pending");
    expect(mapSellerOrderPaymentStatus("FAILED")).toBe("Failed");
    expect(mapSellerOrderPaymentStatus("EXPIRED")).toBe("Failed");
    expect(mapSellerOrderPaymentStatus("CANCELLED")).toBe("Failed");
  });

  it("maps status tab filters to backend payment_status", () => {
    expect(mapStatusTabToPaymentStatus("Semua")).toBeUndefined();
    expect(mapStatusTabToPaymentStatus("Paid")).toBe("PAID");
    expect(mapStatusTabToPaymentStatus("Pending")).toBe("PENDING");
    expect(mapStatusTabToPaymentStatus("Failed")).toBe("FAILED");
  });

  it("maps list row onto existing SellerOrder view", () => {
    const view = mapSellerOrderSummaryDto(listRow);
    expect(view.id).toBe("FRS-240712-1842");
    expect(view.internalOrderId).toBe("01HQ0ORDER000000000000001");
    expect(view.storeId).toBe("store_live");
    expect(view.customer).toBe("Nadia Putri");
    expect(view.email).toBe("nadia@studio.id");
    expect(view.product).toBe("AI Prompt Pack");
    expect(view.amount).toBe(79_000);
    expect(view.feeIdr).toBe(3_070);
    expect(view.merchantNetIdr).toBe(75_930);
    expect(view.status).toBe("Paid");
    expect(view.avatar).toBe("NP");
    expect(() => assertNoDeliverySecretsInSellerOrder(view)).not.toThrow();
  });

  it("maps detail fee/net from server snapshot only", () => {
    const view = mapSellerOrderDetailDto(detailDto);
    expect(view.feeIdr).toBe(3_070);
    expect(view.merchantNetIdr).toBe(75_930);
    expect(view.payment?.provider).toBe("Xendit");
    expect(view.payment?.paymentIntent).toBe("qris_2Yc91p");
    expect(view.delivery?.fulfilled).toBe(true);
    expect(view.delivery?.accessCount).toBe(1);
    expect(view.timeline?.length).toBe(3);
    expect(JSON.stringify(view)).not.toMatch(/secret|password|accessToken/i);
  });

  it("maps numbered envelope meta for TablePagination", () => {
    const page = mapSellerOrderListEnvelope([listRow], meta);
    expect(page.items).toHaveLength(1);
    expect(page.totalCount).toBe(1);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    expect(page.pageCount).toBe(1);
  });

  it("initials from buyer name", () => {
    expect(initialsFromName("Nadia Putri")).toBe("NP");
    expect(initialsFromName("Rizky")).toBe("RI");
  });

  it("client filter mapping preserves order for mock path", () => {
    const items = [
      viewOrder({ id: "a", status: "Paid", customer: "Nadia" }),
      viewOrder({ id: "b", status: "Pending", customer: "Rizky" }),
      viewOrder({ id: "c", status: "Failed", customer: "Dimas" }),
    ];
    expect(applySellerOrderListFilters(items, { statusTab: "Paid" })).toEqual([
      items[0],
    ]);
    expect(
      applySellerOrderListFilters(items, { q: "rizky" }).map((x) => x.id),
    ).toEqual(["b"]);
  });
});

describe("SEL-250 api adapters", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("mock path returns fixtures without network", async () => {
    installMockSeller();
    const { listSellerOrders, getSellerOrder } = await import(
      "@/features/orders/api"
    );
    const page = await listSellerOrders(DEMO_STORE_ID, {
      statusTab: "Paid",
      page: 1,
      pageSize: 5,
    });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((o) => o.status === "Paid")).toBe(true);
    const order = await getSellerOrder(DEMO_STORE_ID, "FRS-240712-1842");
    expect(order?.customer).toBe("Nadia Putri");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list is store-scoped and maps filters to query", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [listRow],
      meta,
    });
    const { listSellerOrders } = await import("@/features/orders/api");
    const page = await listSellerOrders("store_live", {
      statusTab: "Paid",
      q: "Nadia",
      page: 2,
      pageSize: 10,
    });
    expect(page.items[0]?.storeId).toBe("store_live");
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0];
    expect(path).toBe("/v1/stores/store_live/orders");
    expect(opts.query).toMatchObject({
      page: 2,
      pageSize: 10,
      status: "PAID",
      q: "Nadia",
    });
  });

  it("api detail foreign/not-found returns null (safe 404)", async () => {
    installApiSeller();
    const { ApiError } = await import("@/shared/api/http-client");
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
        requestId: "req_404",
      }),
    );
    const { getSellerOrder } = await import("@/features/orders/api");
    const order = await getSellerOrder("store_live", "foreign_order");
    expect(order).toBeNull();
    const [path] = apiRequestMock.mock.calls[0];
    expect(path).toBe("/v1/stores/store_live/orders/foreign_order");
  });

  it("query keys include store id and filters", () => {
    const key = queryKeys.seller.orders("store_a", {
      statusTab: "Paid",
      page: 1,
    });
    expect(key[0]).toBe("seller");
    expect(key[1]).toBe("store_a");
    expect(key[2]).toBe("orders");
    expect(key[3]).toMatchObject({ statusTab: "Paid", page: 1 });
    expect(queryKeys.seller.order("store_a", "ord_1")).toEqual([
      "seller",
      "store_a",
      "orders",
      "ord_1",
    ]);
  });
});
