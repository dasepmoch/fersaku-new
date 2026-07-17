import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  catalogProductEnvelopeSchema,
  catalogProductListEnvelopeSchema,
  featuredCatalogProductListEnvelopeSchema,
  publicStorefrontEnvelopeSchema,
  structuralEnvelopeSchema,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type {
  CatalogProduct,
  FeaturedCatalogProduct,
  PublicProductMatch,
  PublicStorefront,
  SellerProductListFilters,
} from "./contracts";
import { SELLER_PRODUCT_LIST_LIMIT } from "./contracts";
import {
  applySellerProductListFilters,
  mapCatalogProductDto,
  mapCatalogProductListDto,
  mapFeaturedCatalogProductListDto,
  mapPublicStorefrontDtoWithStoreSlug,
  toPublicProductMatch,
} from "./mappers";
import { demoProducts, findDemoProduct, getDemoStorefront } from "./mock";

type FeaturedListEnvelope = z.infer<
  typeof featuredCatalogProductListEnvelopeSchema
>;
type CatalogListEnvelope = z.infer<typeof catalogProductListEnvelopeSchema>;
type CatalogProductEnvelope = z.infer<typeof catalogProductEnvelopeSchema>;
type PublicStorefrontEnvelope = z.infer<typeof publicStorefrontEnvelopeSchema>;

/** Short public SSR/browser revalidate for published catalog (PUB-100). */
export const PUBLIC_CATALOG_REVALIDATE_SECONDS = 60;
export const PUBLIC_CATALOG_CACHE_TAG = "public-catalog";

export type PublishProductInput = {
  storeId: string;
  productId: string;
  reason?: string;
  idempotencyKey?: string;
};

export type PublishProductResult = {
  accepted: boolean;
  productId: string;
  requestId: string;
};

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

function featuredFromDemo(limit: number): FeaturedCatalogProduct[] {
  return demoProducts.slice(0, limit).map((p) => ({
    ...p,
    storeSlug: p.storeSlug || "asep-ai-tools",
  }));
}

/**
 * Featured published products. Each item carries canonical storeSlug for links.
 * Mock fixtures attach demo store slugs; API requires storeSlug in schema.
 */
export async function listFeaturedProducts(
  limit = 6,
  signal?: AbortSignal,
): Promise<FeaturedCatalogProduct[]> {
  if (shouldUseMockFixtures("publicCatalog")) return featuredFromDemo(limit);

  const response = await apiRequest<FeaturedListEnvelope>(
    "/v1/public/products/featured",
    {
      schema: featuredCatalogProductListEnvelopeSchema,
      query: { limit },
      signal,
    },
  );
  return mapFeaturedCatalogProductListDto(response.data);
}

export async function publishSellerProduct(
  input: PublishProductInput,
  signal?: AbortSignal,
): Promise<PublishProductResult> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return {
      accepted: true,
      productId: input.productId,
      requestId: `mock_publish_${input.productId}`,
    };
  }
  const response = await apiRequest<
    ApiEnvelope<PublishProductResult>,
    PublishProductInput
  >(`/v1/stores/${input.storeId}/products/${input.productId}/publish`, {
    schema: structuralEnvelopeSchema,
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
    auditReason: input.reason,
  });
  return response.data;
}

/**
 * SEL-210 — store-scoped seller product list (BoundedNoPaging).
 * BE GET /v1/stores/{storeId}/products has no search/status/limit query yet;
 * client maps existing SearchBox filter + hard-caps at SELLER_PRODUCT_LIST_LIMIT.
 * Do not fetch extra pages for local pagination.
 */
export async function listSellerProducts(
  storeId: string,
  signal?: AbortSignal,
  filters?: SellerProductListFilters,
): Promise<CatalogProduct[]> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return applySellerProductListFilters(demoProducts, filters);
  }

  const response = await apiRequest<CatalogListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/products`,
    {
      schema: catalogProductListEnvelopeSchema,
      signal,
    },
  );
  const mapped = mapCatalogProductListDto(response.data);
  return applySellerProductListFilters(
    mapped,
    filters,
    SELLER_PRODUCT_LIST_LIMIT,
  );
}

export async function getSellerProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<CatalogProduct | null> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return demoProducts.find((product) => product.id === productId) || null;
  }

  try {
    const response = await apiRequest<CatalogProductEnvelope>(
      `/v1/stores/${storeId}/products/${productId}`,
      {
        schema: catalogProductEnvelopeSchema,
        signal,
      },
    );
    return mapCatalogProductDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Public storefront by slug. 404 RESOURCE_NOT_FOUND → null; network/5xx rethrow.
 */
export async function getPublicStorefront(
  slug: string,
  signal?: AbortSignal,
): Promise<PublicStorefront | null> {
  if (shouldUseMockFixtures("publicCatalog")) return getDemoStorefront(slug);

  try {
    const response = await apiRequest<PublicStorefrontEnvelope>(
      `/v1/public/stores/${encodeURIComponent(slug)}`,
      {
        schema: publicStorefrontEnvelopeSchema,
        signal,
      },
    );
    return mapPublicStorefrontDtoWithStoreSlug(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Dedicated public product lookup, optionally bound to storeSlug.
 * When storeSlug is provided, BE uses store-bound slug resolution (dual-store safe).
 * 404 → null; network/5xx rethrow.
 */
export async function getPublicProduct(
  productIdOrSlug: string,
  options?: { storeSlug?: string; signal?: AbortSignal },
): Promise<PublicProductMatch | null> {
  const storeSlug = options?.storeSlug?.trim();
  const signal = options?.signal;

  if (shouldUseMockFixtures("publicCatalog")) {
    if (storeSlug) {
      const store = getDemoStorefront(storeSlug);
      if (!store) return null;
      const product = store.products.find(
        (p) => p.id === productIdOrSlug || p.slug === productIdOrSlug,
      );
      if (!product) return null;
      return toPublicProductMatch(
        { ...product, storeSlug: store.slug },
        store.slug,
      );
    }
    const match = findDemoProduct(productIdOrSlug);
    if (!match) return null;
    return toPublicProductMatch(
      { ...match.product, storeSlug: match.store.slug },
      match.store.slug,
    );
  }

  try {
    const response = await apiRequest<CatalogProductEnvelope>(
      `/v1/public/products/${encodeURIComponent(productIdOrSlug)}`,
      {
        schema: catalogProductEnvelopeSchema,
        query: storeSlug ? { store: storeSlug } : undefined,
        signal,
      },
    );
    const product = mapCatalogProductDto(response.data);
    const resolvedSlug = product.storeSlug || storeSlug;
    if (!resolvedSlug) {
      return toPublicProductMatch(product, "");
    }
    return toPublicProductMatch(product, resolvedSlug);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Legacy helper used by checkout: product + optional full storefront.
 * Prefer getPublicProduct + getPublicStorefront for store-bound product pages.
 */
export async function findPublicProduct(
  productIdOrSlug: string,
  signal?: AbortSignal,
) {
  if (shouldUseMockFixtures("publicCatalog")) {
    return findDemoProduct(productIdOrSlug);
  }

  const match = await getPublicProduct(productIdOrSlug, { signal });
  if (!match) return null;
  const store = match.storeSlug
    ? await getPublicStorefront(match.storeSlug, signal)
    : null;
  if (!store) {
    return { product: match.product, store: null as unknown as PublicStorefront };
  }
  return { product: match.product, store };
}

/**
 * Storefront builder preview seed products.
 * Mock mode returns fixtures; API/disabled return empty until storefront catalog wire.
 * Presentation must not import ./mock (INT-170).
 */
export function getStorefrontBuilderPreviewProducts(): CatalogProduct[] {
  if (getDomainSource("sellerCatalog") !== "mock") return [];
  return demoProducts;
}
