import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import {
  getDemoInventoryProduct,
  stockProducts,
  type InventoryProduct,
} from "./mock";

export async function listSellerInventory(
  storeId: string,
  signal?: AbortSignal,
): Promise<InventoryProduct[]> {
  if (shouldUseMockFixtures("sellerCatalog")) return stockProducts;
  const response = await apiRequest<ApiEnvelope<InventoryProduct[]>>(
    `/v1/stores/${storeId}/inventory/products`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}

export async function getSellerInventoryProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<InventoryProduct | null> {
  if (shouldUseMockFixtures("sellerCatalog")) return getDemoInventoryProduct(productId);
  const response = await apiRequest<ApiEnvelope<InventoryProduct>>(
    `/v1/stores/${storeId}/inventory/products/${productId}`,
    {
    schema: structuralEnvelopeSchema, signal },
  );
  return response.data;
}
