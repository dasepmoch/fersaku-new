import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogProductDtoSchema } from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { listSellerProducts } from "@/features/catalog/api";
import {
  SELLER_PRODUCT_LIST_LIMIT,
  type CatalogProduct,
} from "@/features/catalog/contracts";
import {
  applySellerProductListFilters,
  mapCatalogProductDto,
  mapProductStatus,
  normalizeProductSearch,
  productStatusListLabel,
} from "@/features/catalog/mappers";
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

function productDto(
  overrides: Partial<{
    id: string;
    slug: string;
    title: string;
    short: string;
    type: "download" | "link" | "code";
    status: "draft" | "published" | "archived";
    price: number;
    sales: number;
  }> = {},
) {
  return {
    id: overrides.id ?? "prod_a",
    slug: overrides.slug ?? "widget",
    title: overrides.title ?? "Widget Pack",
    short: overrides.short ?? "Short blurb",
    description: "Full description",
    price: overrides.price ?? 50_000,
    type: overrides.type ?? "download",
    sales: overrides.sales ?? 0,
    palette: "#e9ff9b",
    glyph: "W",
    includes: [] as string[],
    status: overrides.status ?? "published",
    storeId: "store_live",
  };
}

function viewProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    slug: "alpha",
    title: "Alpha Tool",
    short: "first",
    description: "d",
    price: 10_000,
    type: "download",
    sales: 0,
    palette: "#fff",
    glyph: "A",
    includes: [],
    status: "published",
    ...overrides,
  };
}

describe("SEL-210 seller product list", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps seller status exhaustively; unknown is not published", () => {
    expect(mapProductStatus("draft")).toBe("draft");
    expect(mapProductStatus("published")).toBe("published");
    expect(mapProductStatus("archived")).toBe("archived");
    expect(() => mapProductStatus("live")).toThrow();
    expect(() => mapProductStatus("unknown")).toThrow();
    expect(productStatusListLabel("draft")).toBe("Draft");
    expect(productStatusListLabel("archived")).toBe("Archived");
    expect(productStatusListLabel("published")).toBe("Published");
    expect(productStatusListLabel(undefined)).toBe("Published");
  });

  it("maps wire DTO status onto CatalogProduct view", () => {
    const dto = catalogProductDtoSchema.parse(productDto({ status: "draft" }));
    const view = mapCatalogProductDto(dto);
    expect(view.status).toBe("draft");
    expect(view.title).toBe("Widget Pack");
  });

  it("empty list stays empty (no fixture inject)", () => {
    const filtered = applySellerProductListFilters([], { q: "" });
    expect(filtered).toEqual([]);
  });

  it("bounds results and never page-walks locally", () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      viewProduct({ id: `p${i}`, title: `Item ${i}` }),
    );
    const bounded = applySellerProductListFilters(many, {});
    expect(bounded).toHaveLength(SELLER_PRODUCT_LIST_LIMIT);
    expect(bounded[0]?.id).toBe("p0");
    expect(bounded.at(-1)?.id).toBe(`p${SELLER_PRODUCT_LIST_LIMIT - 1}`);
  });

  it("maps search/status/type filters without dropping order", () => {
    const items = [
      viewProduct({
        id: "a",
        title: "Canva Kit",
        slug: "canva-kit",
        status: "published",
        type: "download",
      }),
      viewProduct({
        id: "b",
        title: "API Access",
        slug: "api-access",
        status: "draft",
        type: "code",
      }),
      viewProduct({
        id: "c",
        title: "Canva Pro",
        slug: "canva-pro",
        status: "archived",
        type: "link",
      }),
    ];
    expect(normalizeProductSearch("  Canva  ")).toBe("canva");
    expect(
      applySellerProductListFilters(items, { q: "canva" }).map((p) => p.id),
    ).toEqual(["a", "c"]);
    expect(
      applySellerProductListFilters(items, { status: "draft" }).map(
        (p) => p.id,
      ),
    ).toEqual(["b"]);
    expect(
      applySellerProductListFilters(items, { type: "code" }).map((p) => p.id),
    ).toEqual(["b"]);
    expect(
      applySellerProductListFilters(items, {
        q: "canva",
        status: "published",
      }).map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("query keys include store + filters + bounded profile", () => {
    const key = queryKeys.seller.products("store_a", {
      q: "kit",
      status: "all",
      type: "all",
    });
    expect(key).toEqual([
      "seller",
      "store_a",
      "products",
      "bounded",
      { q: "kit", status: "all", type: "all" },
    ]);
    expect(queryKeys.seller.products("store_b")[1]).toBe("store_b");
    expect(queryKeys.seller.products("store_a")[1]).not.toBe(
      queryKeys.seller.products("store_b")[1],
    );
  });

  it("API adapter uses store-scoped path and applies empty list", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [],
      meta: { requestId: "req_1", timestamp: "2026-07-17T07:00:00Z" },
    });

    const result = await listSellerProducts("store_live");

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/stores/store_live/products");
    expect(result).toEqual([]);
  });

  it("API adapter maps products and applies search filter client-side", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [
        productDto({ id: "1", title: "Prompt Pack", status: "published" }),
        productDto({
          id: "2",
          title: "Other",
          slug: "other",
          status: "draft",
        }),
      ],
      meta: { requestId: "req_2", timestamp: "2026-07-17T07:00:00Z" },
    });

    const result = await listSellerProducts("store_live", undefined, {
      q: "prompt",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("1");
    expect(result[0]?.status).toBe("published");
  });

  it("foreign store path is encoded and isolated", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [],
      meta: { requestId: "req_3", timestamp: "2026-07-17T07:00:00Z" },
    });
    await listSellerProducts("store_other/../x");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/stores/store_other%2F..%2Fx/products",
    );
    expect(queryKeys.seller.products("store_other")[1]).toBe("store_other");
  });

  it("mock fixtures never hit transport", async () => {
    installMockSeller();
    const products = await listSellerProducts("demo_store");
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(products.length).toBeGreaterThan(0);
  });
});
