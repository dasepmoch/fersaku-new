import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  catalogProductEnvelopeSchema,
  catalogProductListEnvelopeSchema,
  featuredCatalogProductListEnvelopeSchema,
  publicStorefrontEnvelopeSchema,
  publishProductEnvelopeSchema,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  ArchiveSellerProductInput,
  CatalogProduct,
  CreateSellerProductInput,
  FeaturedCatalogProduct,
  PatchSellerProductInput,
  PublicProductMatch,
  PublicStorefront,
  PublishSellerProductInput,
  PublishSellerProductResult,
  SellerProductListFilters,
} from "./contracts";
import { SELLER_PRODUCT_LIST_LIMIT } from "./contracts";
import {
  applySellerProductListFilters,
  mapCatalogProductDto,
  mapCatalogProductListDto,
  mapFeaturedCatalogProductListDto,
  mapPublicStorefrontDtoWithStoreSlug,
  toCreateProductRequestBody,
  toPatchProductRequestBody,
  toPublicProductMatch,
} from "./mappers";
import { demoProducts, findDemoProduct, getDemoStorefront } from "./mock";

type FeaturedListEnvelope = z.infer<
  typeof featuredCatalogProductListEnvelopeSchema
>;
type CatalogListEnvelope = z.infer<typeof catalogProductListEnvelopeSchema>;
type CatalogProductEnvelope = z.infer<typeof catalogProductEnvelopeSchema>;
type PublicStorefrontEnvelope = z.infer<typeof publicStorefrontEnvelopeSchema>;
type PublishProductEnvelope = z.infer<typeof publishProductEnvelopeSchema>;

/** Short public SSR/browser revalidate for published catalog (PUB-100). */
export const PUBLIC_CATALOG_REVALIDATE_SECONDS = 60;
export const PUBLIC_CATALOG_CACHE_TAG = "public-catalog";

/** @deprecated Prefer PublishSellerProductInput (SEL-220). */
export type PublishProductInput = PublishSellerProductInput;
/** @deprecated Prefer PublishSellerProductResult (SEL-220). */
export type PublishProductResult = PublishSellerProductResult;

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

  try {
    const response = await apiRequest<FeaturedListEnvelope>(
      "/v1/public/products/featured",
      {
        schema: featuredCatalogProductListEnvelopeSchema,
        query: { limit },
        signal,
      },
    );
    return mapFeaturedCatalogProductListDto(response.data);
  } catch (error) {
    // Image build / cold SSR without API: empty featured list, revalidate later.
    // Do not fail `next build` for transport outage on public marketing surface.
    if (error instanceof ApiError && error.status === 0) return [];
    throw error;
  }
}

/**
 * SEL-220 — create draft product.
 * Idempotency required for create (duplicate submit must not mint two products).
 */
export async function createSellerProduct(
  input: CreateSellerProductInput,
  signal?: AbortSignal,
): Promise<CatalogProduct> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    const body = toCreateProductRequestBody(input);
    const id = `mock_prod_${Date.now().toString(36)}`;
    const slug =
      typeof body.slug === "string" && body.slug
        ? body.slug
        : `product-${id.slice(-6)}`;
    return {
      id,
      slug,
      title: String(body.title),
      short: typeof body.short === "string" ? body.short : "",
      description: typeof body.description === "string" ? body.description : "",
      price: Number(body.price) || 0,
      type: body.type as CatalogProduct["type"],
      sales: 0,
      palette: typeof body.palette === "string" ? body.palette : "#e9ff9b",
      glyph: typeof body.glyph === "string" ? body.glyph : "PR",
      includes: Array.isArray(body.includes) ? (body.includes as string[]) : [],
      status: "draft",
      storeId: input.storeId,
    };
  }

  const body = toCreateProductRequestBody(input);
  const response = await apiRequest<CatalogProductEnvelope, typeof body>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/products`,
    {
      method: "POST",
      body,
      schema: catalogProductEnvelopeSchema,
      signal,
      idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
    },
  );
  return mapCatalogProductDto(response.data);
}

/**
 * SEL-220 — patch product fields (not status). Status via publish/archive only.
 */
export async function patchSellerProduct(
  input: PatchSellerProductInput,
  signal?: AbortSignal,
): Promise<CatalogProduct> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    const existing = demoProducts.find((p) => p.id === input.productId) ?? null;
    const body = toPatchProductRequestBody(input);
    const base: CatalogProduct = existing ?? {
      id: input.productId,
      slug: "product",
      title: "Product",
      short: "",
      description: "",
      price: 0,
      type: "download",
      sales: 0,
      palette: "#e9ff9b",
      glyph: "PR",
      includes: [],
      status: "draft",
      storeId: input.storeId,
    };
    return {
      ...base,
      ...(typeof body.slug === "string" ? { slug: body.slug } : {}),
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.short === "string" ? { short: body.short } : {}),
      ...(typeof body.description === "string"
        ? { description: body.description }
        : {}),
      ...(typeof body.price === "number" ? { price: body.price } : {}),
      ...(typeof body.type === "string"
        ? { type: body.type as CatalogProduct["type"] }
        : {}),
      storeId: input.storeId,
    };
  }

  const body = toPatchProductRequestBody(input);
  const response = await apiRequest<CatalogProductEnvelope, typeof body>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/products/${encodeURIComponent(input.productId)}`,
    {
      method: "PATCH",
      body,
      schema: catalogProductEnvelopeSchema,
      signal,
      ifMatch: input.ifMatch,
    },
  );
  return mapCatalogProductDto(response.data);
}

/**
 * SEL-220 — catalog publish (draft → published). Not file/release publish.
 * Empty body; idempotency key when caller supplies one.
 */
export async function publishSellerProduct(
  input: PublishSellerProductInput,
  signal?: AbortSignal,
): Promise<PublishSellerProductResult> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    const product = demoProducts.find((p) => p.id === input.productId);
    return {
      accepted: true,
      productId: input.productId,
      requestId: `mock_publish_${input.productId}`,
      product: product
        ? { ...product, status: "published", storeId: input.storeId }
        : undefined,
    };
  }

  const response = await apiRequest<PublishProductEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/products/${encodeURIComponent(input.productId)}/publish`,
    {
      method: "POST",
      schema: publishProductEnvelopeSchema,
      signal,
      idempotencyKey: input.idempotencyKey,
      auditReason: input.reason,
    },
  );
  const data = response.data;
  return {
    accepted: data.accepted,
    productId: data.productId,
    requestId: data.requestId,
    product: data.product ? mapCatalogProductDto(data.product) : undefined,
  };
}

/**
 * SEL-220 — archive product (explicit endpoint; not delete).
 */
export async function archiveSellerProduct(
  input: ArchiveSellerProductInput,
  signal?: AbortSignal,
): Promise<CatalogProduct> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    const existing = demoProducts.find((p) => p.id === input.productId) ?? null;
    const base: CatalogProduct = existing ?? {
      id: input.productId,
      slug: "product",
      title: "Product",
      short: "",
      description: "",
      price: 0,
      type: "download",
      sales: 0,
      palette: "#e9ff9b",
      glyph: "PR",
      includes: [],
      storeId: input.storeId,
    };
    return { ...base, status: "archived", storeId: input.storeId };
  }

  const response = await apiRequest<CatalogProductEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/products/${encodeURIComponent(input.productId)}/archive`,
    {
      method: "POST",
      schema: catalogProductEnvelopeSchema,
      signal,
      idempotencyKey: input.idempotencyKey,
      auditReason: input.reason,
    },
  );
  return mapCatalogProductDto(response.data);
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
      `/v1/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`,
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
    return {
      product: match.product,
      store: null as unknown as PublicStorefront,
    };
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
