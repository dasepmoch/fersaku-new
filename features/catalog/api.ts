import { apiRequest } from "@/shared/api/http-client";
import {
  catalogProductEnvelopeSchema,
  catalogProductListEnvelopeSchema,
  publicStorefrontEnvelopeSchema,
  structuralEnvelopeSchema,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { CatalogProduct } from "./contracts";
import { demoProducts, findDemoProduct, getDemoStorefront } from "./mock";

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

export async function listFeaturedProducts(
  limit = 6,
  signal?: AbortSignal,
): Promise<CatalogProduct[]> {
  if (shouldUseMockFixtures("publicCatalog")) return demoProducts.slice(0, limit);
  const response = await apiRequest<ApiEnvelope<CatalogProduct[]>>(
    "/v1/public/products/featured",
    { schema: catalogProductListEnvelopeSchema, query: { limit }, signal },
  );
  return response.data;
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

export async function listSellerProducts(
  storeId: string,
  signal?: AbortSignal,
): Promise<CatalogProduct[]> {
  if (shouldUseMockFixtures("sellerCatalog")) return demoProducts;

  const response = await apiRequest<ApiEnvelope<CatalogProduct[]>>(
    `/v1/stores/${storeId}/products`,
    { schema: catalogProductListEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getSellerProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<CatalogProduct | null> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return demoProducts.find((product) => product.id === productId) || null;
  }

  const response = await apiRequest<ApiEnvelope<CatalogProduct>>(
    `/v1/stores/${storeId}/products/${productId}`,
    { schema: catalogProductEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getPublicStorefront(slug: string, signal?: AbortSignal) {
  if (shouldUseMockFixtures("publicCatalog")) return getDemoStorefront(slug);

  const response = await apiRequest<
    ApiEnvelope<Awaited<ReturnType<typeof getDemoStorefront>>>
  >(`/v1/public/stores/${slug}`, {
    schema: publicStorefrontEnvelopeSchema,
    signal,
  });
  return response.data;
}

export async function findPublicProduct(
  productIdOrSlug: string,
  signal?: AbortSignal,
) {
  if (shouldUseMockFixtures("publicCatalog")) return findDemoProduct(productIdOrSlug);

  const response = await apiRequest<
    ApiEnvelope<NonNullable<Awaited<ReturnType<typeof findDemoProduct>>>>
  >(`/v1/public/products/${productIdOrSlug}`, {
    schema: catalogProductEnvelopeSchema,
    signal,
  });
  return response.data;
}
