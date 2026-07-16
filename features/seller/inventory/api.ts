import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import {
  getDemoInventoryProduct,
  stockProducts,
  type InventoryProduct,
} from "./mock";

export async function listSellerInventory(
  storeId: string,
  signal?: AbortSignal,
): Promise<InventoryProduct[]> {
  if (!isLiveApi()) return stockProducts;
  const response = await apiRequest<ApiEnvelope<InventoryProduct[]>>(
    `/v1/stores/${storeId}/inventory/products`,
    { signal },
  );
  return response.data;
}

export async function getSellerInventoryProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<InventoryProduct | null> {
  if (!isLiveApi()) return getDemoInventoryProduct(productId);
  const response = await apiRequest<ApiEnvelope<InventoryProduct>>(
    `/v1/stores/${storeId}/inventory/products/${productId}`,
    { signal },
  );
  return response.data;
}
