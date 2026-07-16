import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
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
  if (!isLiveApi()) return demoProducts.slice(0, limit);
  const response = await apiRequest<ApiEnvelope<CatalogProduct[]>>(
    "/v1/public/products/featured",
    { query: { limit }, signal },
  );
  return response.data;
}

export async function publishSellerProduct(
  input: PublishProductInput,
  signal?: AbortSignal,
): Promise<PublishProductResult> {
  if (!isLiveApi()) {
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
  if (!isLiveApi()) return demoProducts;

  const response = await apiRequest<ApiEnvelope<CatalogProduct[]>>(
    `/v1/stores/${storeId}/products`,
    { signal },
  );
  return response.data;
}

export async function getSellerProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<CatalogProduct | null> {
  if (!isLiveApi()) {
    return demoProducts.find((product) => product.id === productId) || null;
  }

  const response = await apiRequest<ApiEnvelope<CatalogProduct>>(
    `/v1/stores/${storeId}/products/${productId}`,
    { signal },
  );
  return response.data;
}

export async function getPublicStorefront(slug: string, signal?: AbortSignal) {
  if (!isLiveApi()) return getDemoStorefront(slug);

  const response = await apiRequest<
    ApiEnvelope<Awaited<ReturnType<typeof getDemoStorefront>>>
  >(`/v1/public/stores/${slug}`, { signal });
  return response.data;
}

export async function findPublicProduct(
  productIdOrSlug: string,
  signal?: AbortSignal,
) {
  if (!isLiveApi()) return findDemoProduct(productIdOrSlug);

  const response = await apiRequest<
    ApiEnvelope<NonNullable<Awaited<ReturnType<typeof findDemoProduct>>>>
  >(`/v1/public/products/${productIdOrSlug}`, { signal });
  return response.data;
}
