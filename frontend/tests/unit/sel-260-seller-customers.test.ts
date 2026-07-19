import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SELLER_CUSTOMER_DEFAULT_PAGE_SIZE,
  sellerCustomerDetailDtoSchema,
  sellerCustomerListEnvelopeSchema,
  sellerCustomerSummaryDtoSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import {
  applySellerCustomerListFilters,
  initialsFromName,
  mapSellerCustomerDetailDto,
  mapSellerCustomerListEnvelope,
  mapSellerCustomerSummaryDto,
} from "@/features/seller/customers/mappers";
import type { SellerCustomer } from "@/features/seller/customers/contracts";
import { DEMO_STORE_ID } from "@/shared/config/demo";

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

const meta = {
  requestId: "req_sel260",
  timestamp: "2026-07-17T10:00:00Z",
  page: 1,
  pageSize: 20,
  totalCount: 1,
  pageCount: 1,
};

const listRow = {
  customerId:
    "a1b2c3d4e5f6789012345678abcdef01abcdef0123456789abcdef0123456789",
  storeId: "store_live",
  displayName: "Nadia Putri",
  displayEmail: "nadia@studio.id",
  orderCount: 12,
  spentIdr: 948_000,
  lastPurchaseAt: "2026-07-12T07:33:00Z",
  firstSeenAt: "2026-03-18T00:00:00Z",
  lastProductTitle: "AI Prompt Pack",
  lastOrderGrossIdr: 79_000,
  lastPaymentStatus: "PAID",
};

const detailDto = {
  customerId: listRow.customerId,
  storeId: "store_live",
  displayName: "Nadia Putri",
  displayEmail: "nadia@studio.id",
  orderCount: 12,
  spentIdr: 948_000,
  avgOrderIdr: 79_000,
  productCount: 4,
  lastPurchaseAt: "2026-07-12T07:33:00Z",
  firstSeenAt: "2026-03-18T00:00:00Z",
  marketingConsent: {
    status: "UNKNOWN",
    label: "Consent status not recorded",
  },
  note: {
    body: "VIP customer",
    version: 2,
    updatedAt: "2026-07-12T08:00:00Z",
    createdAt: "2026-07-01T08:00:00Z",
  },
  orders: [
    {
      orderId: "01HQ0ORDER000000000000001",
      orderNumber: "FRS-240712-1842",
      productTitle: "AI Prompt Pack",
      paymentStatus: "PAID",
      grossIdr: 79_000,
      paidAt: "2026-07-12T07:33:00Z",
      createdAt: "2026-07-12T07:32:00Z",
    },
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

function viewCustomer(overrides: Partial<SellerCustomer> = {}): SellerCustomer {
  return {
    id: "cust_1",
    customer: "A",
    email: "a@x.id",
    product: "P",
    amount: 10_000,
    status: "Paid",
    date: "now",
    avatar: "A",
    orders: 1,
    spent: 10_000,
    ...overrides,
  };
}

describe("SEL-260 schemas", () => {
  it("accepts summary + numbered list envelope", () => {
    expect(sellerCustomerSummaryDtoSchema.safeParse(listRow).success).toBe(
      true,
    );
    const env = sellerCustomerListEnvelopeSchema.safeParse({
      data: [listRow],
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("accepts detail with history and note", () => {
    expect(sellerCustomerDetailDtoSchema.safeParse(detailDto).success).toBe(
      true,
    );
  });

  it("rejects fractional money", () => {
    expect(
      sellerCustomerSummaryDtoSchema.safeParse({
        ...listRow,
        spentIdr: 948_000.5,
      }).success,
    ).toBe(false);
  });

  it("documents default page size", () => {
    expect(SELLER_CUSTOMER_DEFAULT_PAGE_SIZE).toBe(20);
  });
});

describe("SEL-260 mappers", () => {
  it("maps list row onto existing SellerCustomer view with server customer id", () => {
    const view = mapSellerCustomerSummaryDto(listRow);
    expect(view.id).toBe(listRow.customerId);
    expect(view.storeId).toBe("store_live");
    expect(view.customer).toBe("Nadia Putri");
    expect(view.email).toBe("nadia@studio.id");
    expect(view.orders).toBe(12);
    expect(view.spent).toBe(948_000);
    expect(view.product).toBe("AI Prompt Pack");
    expect(view.avatar).toBe("NP");
  });

  it("maps detail metrics and history from server snapshot only", () => {
    const view = mapSellerCustomerDetailDto(detailDto);
    expect(view.spent).toBe(948_000);
    expect(view.avgOrder).toBe(79_000);
    expect(view.productCount).toBe(4);
    expect(view.noteBody).toBe("VIP customer");
    expect(view.noteVersion).toBe(2);
    expect(view.history).toHaveLength(1);
    expect(view.history?.[0]?.id).toBe("FRS-240712-1842");
    expect(view.history?.[0]?.amount).toBe(79_000);
    expect(view.marketingConsentLabel).toBe("Consent status not recorded");
  });

  it("maps numbered envelope meta for TablePagination", () => {
    const page = mapSellerCustomerListEnvelope([listRow], meta);
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
      viewCustomer({ id: "a", customer: "Nadia", email: "n@x.id" }),
      viewCustomer({ id: "b", customer: "Rizky", email: "r@x.id" }),
    ];
    expect(
      applySellerCustomerListFilters(items, { q: "rizky" }).map((x) => x.id),
    ).toEqual(["b"]);
  });
});

describe("SEL-260 api adapters", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("mock path returns fixtures without network", async () => {
    installMockSeller();
    const { listSellerCustomers, getSellerCustomer } =
      await import("@/features/seller/customers/api");
    const page = await listSellerCustomers(DEMO_STORE_ID, {
      page: 1,
      pageSize: 5,
    });
    expect(page.items.length).toBeGreaterThan(0);
    expect(apiRequestMock).not.toHaveBeenCalled();
    const first = page.items[0];
    const detail = await getSellerCustomer(DEMO_STORE_ID, first.id);
    expect(detail?.customer).toBeTruthy();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list is store-scoped and maps search/page to query", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [listRow],
      meta,
    });
    const { listSellerCustomers } =
      await import("@/features/seller/customers/api");
    const page = await listSellerCustomers("store_live", {
      q: "Nadia",
      page: 2,
      pageSize: 10,
    });
    expect(page.items[0]?.storeId).toBe("store_live");
    expect(page.items[0]?.id).toBe(listRow.customerId);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0];
    expect(path).toBe("/v1/stores/store_live/customers");
    expect(opts.query).toMatchObject({
      page: 2,
      pageSize: 10,
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
    const { getSellerCustomer } =
      await import("@/features/seller/customers/api");
    const customer = await getSellerCustomer("store_live", "foreign_customer");
    expect(customer).toBeNull();
    const [path] = apiRequestMock.mock.calls[0];
    expect(path).toBe("/v1/stores/store_live/customers/foreign_customer");
  });

  it("query keys include store id and filters (no raw PII)", () => {
    const key = queryKeys.seller.customers("store_a", {
      q: "search-token",
      page: 1,
    });
    expect(key[0]).toBe("seller");
    expect(key[1]).toBe("store_a");
    expect(key[2]).toBe("customers");
    expect(key[3]).toMatchObject({ page: 1 });
    expect(queryKeys.seller.customer("store_a", "cust_1")).toEqual([
      "seller",
      "store_a",
      "customers",
      "cust_1",
    ]);
  });
});
