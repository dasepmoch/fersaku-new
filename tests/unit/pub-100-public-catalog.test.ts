import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  mapCatalogProductDto,
  mapFeaturedCatalogProductDto,
  mapFeaturedCatalogProductListDto,
  publicProductHref,
} from "@/features/catalog/mappers";
import {
  getPublicProduct,
  getPublicStorefront,
  listFeaturedProducts,
} from "@/features/catalog/api";
import {
  emptyRatingSummary,
  mapPublicReviewSummaryDto,
  reviewDistributionWidthPercent,
} from "@/features/seller/reviews/mappers";
import {
  getPublicProductRating,
  listPublicProductReviews,
} from "@/features/seller/reviews/api";

const meta = {
  requestId: "req_pub100",
  timestamp: "2026-07-17T10:00:00Z",
};

function productDto(
  overrides: Partial<{
    id: string;
    slug: string;
    storeSlug: string;
    title: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "prod_shared",
    slug: overrides.slug ?? "shared-pack",
    title: overrides.title ?? "Shared Pack",
    short: "Short",
    description: "Long",
    price: 99_000,
    type: "download" as const,
    sales: 1,
    palette: "violet",
    glyph: "✦",
    includes: ["PDF"],
    storeSlug: overrides.storeSlug,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("PUB-100 featured storeSlug", () => {
  it("maps featured DTO requiring storeSlug", () => {
    const view = mapFeaturedCatalogProductDto(
      productDto({ storeSlug: "designkit-studio" }) as never,
    );
    expect(view.storeSlug).toBe("designkit-studio");
    expect(publicProductHref(view.storeSlug, view.slug)).toBe(
      "/@designkit-studio/shared-pack",
    );
  });

  it("fails closed when featured storeSlug missing", () => {
    expect(() =>
      mapFeaturedCatalogProductDto(productDto({ storeSlug: "" }) as never),
    ).toThrow(ApiError);
  });

  it("mock featured list attaches per-product storeSlug (no empty / hardcoded missing)", async () => {
    const products = await listFeaturedProducts(6);
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p.storeSlug).toBeTruthy();
      expect(p.storeSlug.length).toBeGreaterThan(0);
      expect(publicProductHref(p.storeSlug, p.slug)).toBe(
        `/@${p.storeSlug}/${p.slug}`,
      );
    }
  });

  it("two storeSlugs with same product slug produce distinct canonical hrefs", () => {
    const a = mapFeaturedCatalogProductDto(
      productDto({
        id: "prod_a",
        slug: "shared-pack",
        storeSlug: "asep-ai-tools",
        title: "A",
      }) as never,
    );
    const b = mapFeaturedCatalogProductDto(
      productDto({
        id: "prod_b",
        slug: "shared-pack",
        storeSlug: "designkit-studio",
        title: "B",
      }) as never,
    );
    expect(a.slug).toBe(b.slug);
    expect(publicProductHref(a.storeSlug, a.slug)).toBe(
      "/@asep-ai-tools/shared-pack",
    );
    expect(publicProductHref(b.storeSlug, b.slug)).toBe(
      "/@designkit-studio/shared-pack",
    );
    expect(publicProductHref(a.storeSlug, a.slug)).not.toBe(
      publicProductHref(b.storeSlug, b.slug),
    );
  });

  it("mapFeatured list preserves per-item storeSlug", () => {
    const list = mapFeaturedCatalogProductListDto([
      productDto({ id: "1", storeSlug: "store-a", slug: "x" }) as never,
      productDto({ id: "2", storeSlug: "store-b", slug: "x" }) as never,
    ]);
    expect(list.map((p) => p.storeSlug)).toEqual(["store-a", "store-b"]);
  });
});

describe("PUB-100 dual-store product resolution (mock)", () => {
  it("resolves same product slug under different stores to correct tenant", async () => {
    // designkit has brand-system-canvas; asep has ai-prompt-pack — inject via store list
    const asep = await getPublicStorefront("asep-ai-tools");
    const design = await getPublicStorefront("designkit-studio");
    expect(asep).not.toBeNull();
    expect(design).not.toBeNull();

    // Use a product only on designkit
    const designProduct = design!.products[0]!;
    const matchDesign = await getPublicProduct(designProduct.slug, {
      storeSlug: "designkit-studio",
    });
    expect(matchDesign?.storeSlug).toBe("designkit-studio");
    expect(matchDesign?.product.id).toBe(designProduct.id);

    // Wrong store + that slug → null
    const wrong = await getPublicProduct(designProduct.slug, {
      storeSlug: "asep-ai-tools",
    });
    expect(wrong).toBeNull();

    // Asep product under asep
    const asepProduct = asep!.products[0]!;
    const matchAsep = await getPublicProduct(asepProduct.slug, {
      storeSlug: "asep-ai-tools",
    });
    expect(matchAsep?.storeSlug).toBe("asep-ai-tools");
    expect(matchAsep?.product.id).toBe(asepProduct.id);
  });

  it("unknown store slug → null (not throw)", async () => {
    await expect(getPublicStorefront("no-such-store-xyz")).resolves.toBeNull();
  });
});

describe("PUB-100 404 vs network", () => {
  it("classifies RESOURCE_NOT_FOUND as not-found mappable; network is not", async () => {
    const { classifyApiError } = await import("@/shared/api/error-policy");
    const notFound = classifyApiError(404, {
      code: PROBLEM_CODES.RESOURCE_NOT_FOUND,
      message: "gone",
      requestId: "r1",
    });
    expect(notFound.kind).toBe("resource_not_found");
    expect(notFound.mayMapToNull).toBe(true);

    const network = classifyApiError(0, {
      code: PROBLEM_CODES.NETWORK_ERROR,
      message: "offline",
      requestId: "r2",
    });
    expect(network.kind).not.toBe("resource_not_found");
    expect(network.mayMapToNull).toBeFalsy();

    const server = classifyApiError(500, {
      code: PROBLEM_CODES.INTERNAL_ERROR,
      message: "boom",
      requestId: "r3",
    });
    expect(server.kind).not.toBe("resource_not_found");
  });

  it("api mode: 404 store → null; 5xx rethrows", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SOURCE_PUBLIC_CATALOG", "api");

    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const { ApiError: LiveApiError } = await import("@/shared/api/api-error");
    const spy = vi.spyOn(http, "apiRequest");

    spy.mockRejectedValueOnce(
      new LiveApiError(404, {
        code: PROBLEM_CODES.RESOURCE_NOT_FOUND,
        message: "Store not found",
        requestId: "r404",
      }),
    );

    const { getPublicStorefront: getStore } = await import(
      "@/features/catalog/api"
    );
    await expect(getStore("missing")).resolves.toBeNull();

    spy.mockRejectedValueOnce(
      new LiveApiError(502, {
        code: PROBLEM_CODES.INTERNAL_ERROR,
        message: "upstream",
        requestId: "r5xx",
      }),
    );
    await expect(getStore("any")).rejects.toMatchObject({ status: 502 });
    spy.mockRestore();
  });
});

describe("PUB-100 zero-review summary", () => {
  it("maps zero count to total=0 and 0% widths without NaN", () => {
    const summary = mapPublicReviewSummaryDto({
      productId: "prod_01",
      count: 0,
      averageRating: 0,
      rating1: 0,
      rating2: 0,
      rating3: 0,
      rating4: 0,
      rating5: 0,
    });
    expect(summary.total).toBe(0);
    expect(summary.average).toBe(0);
    for (const score of [1, 2, 3, 4, 5]) {
      const w = reviewDistributionWidthPercent(summary, score);
      expect(w).toBe(0);
      expect(Number.isNaN(w)).toBe(false);
      expect(`${w}%`).toBe("0%");
    }
  });

  it("maps BE summary shape to distribution widths", () => {
    const summary = mapPublicReviewSummaryDto({
      count: 10,
      averageRating: 4.5,
      rating1: 0,
      rating2: 0,
      rating3: 0,
      rating4: 5,
      rating5: 5,
    });
    expect(summary.total).toBe(10);
    expect(reviewDistributionWidthPercent(summary, 5)).toBe(50);
    expect(reviewDistributionWidthPercent(summary, 4)).toBe(50);
    expect(reviewDistributionWidthPercent(summary, 1)).toBe(0);
  });

  it("emptyRatingSummary is zero-safe", () => {
    const empty = emptyRatingSummary();
    expect(empty.total).toBe(0);
    expect(reviewDistributionWidthPercent(empty, 5)).toBe(0);
  });

  it("mock product reviews load without NaN distribution math", async () => {
    const rating = await getPublicProductRating("prod_01");
    for (const score of [1, 2, 3, 4, 5]) {
      const w = reviewDistributionWidthPercent(rating, score);
      expect(Number.isFinite(w)).toBe(true);
      expect(Number.isNaN(w)).toBe(false);
    }
    const reviews = await listPublicProductReviews("prod_01");
    expect(Array.isArray(reviews)).toBe(true);
  });
});

describe("PUB-100 catalog product storeSlug on identity map", () => {
  it("preserves optional storeSlug on catalog product map", () => {
    const view = mapCatalogProductDto(
      productDto({ storeSlug: "tenant-x" }) as never,
    );
    expect(view.storeSlug).toBe("tenant-x");
  });
});
