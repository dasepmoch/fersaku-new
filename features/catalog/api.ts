import { products } from "@/lib/mock-data";
import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type { CatalogProduct } from "./contracts";

export async function listSellerProducts(
  storeId: string,
  signal?: AbortSignal,
): Promise<CatalogProduct[]> {
  if (!isLiveApi()) return products;

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
    return products.find((product) => product.id === productId) || null;
  }

  const response = await apiRequest<ApiEnvelope<CatalogProduct>>(
    `/v1/stores/${storeId}/products/${productId}`,
    { signal },
  );
  return response.data;
}
