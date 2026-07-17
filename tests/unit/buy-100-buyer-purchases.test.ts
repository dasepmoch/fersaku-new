import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  BUYER_PURCHASE_LIST_LIMIT,
  buyerPurchaseDetailDtoSchema,
  buyerPurchaseDetailEnvelopeSchema,
  buyerPurchaseListEnvelopeSchema,
  buyerPurchaseSummaryDtoSchema,
} from "@/shared/api/schemas";
import {
  assertNoDeliverySecretsInListItem,
  mapBuyerPurchaseDetailDto,
  mapBuyerPurchaseSummaryDto,
  mapBuyerPurchaseSummaryListDto,
  mapDeliveryKindToType,
} from "@/features/buyer/data/mappers";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";

const meta = {
  requestId: "req_buy100",
  timestamp: "2026-07-17T10:00:00Z",
};

const listRow = {
  orderId: "01HQ0ORDER000000000000001",
  orderNumber: "FRS-240712-1842",
  storeId: "store_1",
  storeName: "Asep AI Tools",
  storeSlug: "asep-ai-tools",
  paymentStatus: "PAID",
  source: "STOREFRONT",
  currency: "IDR",
  grossIdr: 79_000,
  paidAt: "2026-07-12T07:33:00Z",
  createdAt: "2026-07-12T07:33:00Z",
  itemCount: 1,
  deliveryStatus: "ACTIVE",
  productId: "prod_01",
  productTitle: "AI Prompt Pack",
  productType: "download",
  productVersion: "v3.0",
  deliveryKind: "DOWNLOAD",
};

const detailDto = {
  orderId: "01HQ0ORDER000000000000001",
  orderNumber: "FRS-240712-1842",
  storeId: "store_1",
  storeName: "Asep AI Tools",
  storeSlug: "asep-ai-tools",
  merchantId: "merch_1",
  paymentStatus: "PAID",
  source: "STOREFRONT",
  currency: "IDR",
  subtotalIdr: 79_000,
  discountIdr: 0,
  tipIdr: 0,
  feeIdr: 0,
  grossIdr: 79_000,
  paidAt: "2026-07-12T07:33:00Z",
  createdAt: "2026-07-12T07:33:00Z",
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
      deliveryStatus: "ACTIVE",
      grantId: "grant_1",
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_buy100",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_buy100",
      },
    },
    status,
  );
}

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("BUY-100 schemas", () => {
  it("accepts purchase summary + cursor list envelope", () => {
    expect(buyerPurchaseSummaryDtoSchema.safeParse(listRow).success).toBe(true);
    const env = buyerPurchaseListEnvelopeSchema.safeParse({
      data: [listRow],
      meta: { ...meta, hasMore: false, nextCursor: null },
    });
    expect(env.success).toBe(true);
  });

  it("accepts purchase detail without secret fields", () => {
    expect(buyerPurchaseDetailDtoSchema.safeParse(detailDto).success).toBe(
      true,
    );
    const env = buyerPurchaseDetailEnvelopeSchema.safeParse({
      data: detailDto,
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("rejects fractional money", () => {
    expect(
      buyerPurchaseSummaryDtoSchema.safeParse({
        ...listRow,
        grossIdr: 79_000.5,
      }).success,
    ).toBe(false);
  });

  it("documents bounded list limit", () => {
    expect(BUYER_PURCHASE_LIST_LIMIT).toBe(20);
  });
});

describe("BUY-100 mappers", () => {
  it("maps list ownership fields to existing BuyerPurchase view", () => {
    const view = mapBuyerPurchaseSummaryDto(listRow);
    expect(view.orderId).toBe("FRS-240712-1842");
    expect(view.internalOrderId).toBe("01HQ0ORDER000000000000001");
    expect(view.product).toBe("AI Prompt Pack");
    expect(view.seller).toBe("Asep AI Tools");
    expect(view.sellerSlug).toBe("asep-ai-tools");
    expect(view.price).toBe(79_000);
    expect(view.status).toBe("Paid");
    expect(view.deliveryType).toBe("download");
    expect(view.sellerUpdatesEnabled).toBe(false);
    expect(view.credentialFields).toBeUndefined();
    expect(view.code).toBeUndefined();
  });

  it("list items never carry delivery secrets", () => {
    const rows = mapBuyerPurchaseSummaryListDto([listRow]);
    for (const p of rows) {
      expect(p.credentialFields).toBeUndefined();
      expect(p.code).toBeUndefined();
      expect(() => assertNoDeliverySecretsInListItem(p)).not.toThrow();
    }
  });

  it("maps detail with redacted delivery shells only", () => {
    const view = mapBuyerPurchaseDetailDto(detailDto);
    expect(view.orderId).toBe("FRS-240712-1842");
    expect(view.deliveryType).toBe("download");
    expect(view.downloads?.fileName).toBe("AI Prompt Pack");
    expect(view.downloads?.fileSize).toBe("—");
    // no signed URL / object key fields on view
    expect(JSON.stringify(view)).not.toMatch(/secret|password|token/i);
  });

  it("maps delivery kinds exhaustively for UI types", () => {
    expect(mapDeliveryKindToType("DOWNLOAD")).toBe("download");
    expect(mapDeliveryKindToType("PROTECTED_LINK")).toBe("link");
    expect(mapDeliveryKindToType("CREDENTIAL")).toBe("credentials");
    expect(mapDeliveryKindToType("CODE")).toBe("code");
    expect(mapDeliveryKindToType(undefined, "link")).toBe("link");
  });

  it("maps credential/code detail without secret values", () => {
    const cred = mapBuyerPurchaseDetailDto({
      ...detailDto,
      items: [
        {
          ...detailDto.items[0],
          deliveryKind: "CREDENTIAL",
          productType: "code",
        },
      ],
    });
    expect(cred.deliveryType).toBe("credentials");
    expect(cred.credentialFields).toEqual([]);

    const code = mapBuyerPurchaseDetailDto({
      ...detailDto,
      items: [
        {
          ...detailDto.items[0],
          deliveryKind: "CODE",
        },
      ],
    });
    expect(code.deliveryType).toBe("code");
    expect(code.code?.value).toBe("");
  });
});

describe("BUY-100 query keys ownership boundary", () => {
  it("separates buyer A vs buyer B cache keys", () => {
    const a = queryKeys.buyer.purchases("buyer_a:ses_a", {
      q: "",
      filter: "Semua",
    });
    const b = queryKeys.buyer.purchases("buyer_b:ses_b", {
      q: "",
      filter: "Semua",
    });
    expect(a).not.toEqual(b);
    expect(a[1]).toBe("buyer_a:ses_a");
    expect(b[1]).toBe("buyer_b:ses_b");
  });

  it("includes filters in list key", () => {
    const all = queryKeys.buyer.purchases("u:s", { q: "", filter: "Semua" });
    const file = queryKeys.buyer.purchases("u:s", { q: "", filter: "File" });
    expect(all).not.toEqual(file);
  });
});

describe("BUY-100 api adapter (api mode)", () => {
  async function loadApiMode() {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");
    return import("@/features/buyer/data/api");
  }

  it("lists bounded purchases and maps ownership fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [listRow],
        meta: { ...meta, hasMore: true, nextCursor: "cur_next" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { listBuyerPurchases, BUYER_PURCHASE_BOUNDED_LIMIT } =
      await loadApiMode();
    const rows = await listBuyerPurchases();
    expect(BUYER_PURCHASE_BOUNDED_LIMIT).toBe(20);
    expect(rows).toHaveLength(1);
    expect(rows[0].orderId).toBe("FRS-240712-1842");
    expect(rows[0].sellerSlug).toBe("asep-ai-tools");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/buyer/purchases");
    expect(url).toContain("limit=20");
    // bounded launch: do not auto-follow cursor
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("empty list preserves empty array (no demo fallback)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [],
          meta: { ...meta, hasMore: false },
        }),
      ),
    );
    const { listBuyerPurchases } = await loadApiMode();
    const rows = await listBuyerPurchases();
    expect(rows).toEqual([]);
  });

  it("client filter File excludes non-download rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            listRow,
            {
              ...listRow,
              orderId: "ord_2",
              orderNumber: "FRS-2",
              deliveryKind: "CODE",
              productType: "code",
              productTitle: "Steam Code",
            },
          ],
          meta: { ...meta, hasMore: false },
        }),
      ),
    );
    const { listBuyerPurchases } = await loadApiMode();
    const files = await listBuyerPurchases(undefined, { filter: "File" });
    expect(files).toHaveLength(1);
    expect(files[0].deliveryType).toBe("download");
  });

  it("detail maps owner purchase; cross-buyer 404 → null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: detailDto, meta }))
      .mockResolvedValueOnce(
        problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getBuyerPurchase } = await loadApiMode();
    const owned = await getBuyerPurchase("FRS-240712-1842");
    expect(owned?.product).toBe("AI Prompt Pack");
    expect(owned?.seller).toBe("Asep AI Tools");

    const other = await getBuyerPurchase("not-owned");
    expect(other).toBeNull();
    const detailUrl = String(fetchMock.mock.calls[0][0]);
    expect(detailUrl).toMatch(/\/v1\/buyer\/purchases\/.*\/$/);
  });

  it("401 on detail rethrows (auth flow, not not-found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(problemResponse(401, PROBLEM_CODES.AUTH_REQUIRED)),
    );
    const { getBuyerPurchase } = await loadApiMode();
    await expect(getBuyerPurchase("x")).rejects.toMatchObject({ status: 401 });
  });

  it("network/5xx rethrows without mock fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(problemResponse(502, "UPSTREAM_ERROR")),
    );
    const { listBuyerPurchases } = await loadApiMode();
    await expect(listBuyerPurchases()).rejects.toMatchObject({ status: 502 });
  });
});

describe("BUY-100 mock mode still works", () => {
  it("lists demo purchases and finds by order id", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { listBuyerPurchases, getBuyerPurchase } = await import(
      "@/features/buyer/data/api"
    );
    const purchases = await listBuyerPurchases();
    expect(purchases.length).toBeGreaterThan(0);
    const found = await getBuyerPurchase(purchases[0].orderId);
    expect(found?.product).toBe(purchases[0].product);
  });
});
