import { apiRequest } from "@/shared/api/http-client";
import { structuralEnvelopeSchema } from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type { InventoryField, StockItem } from "./contracts";
import {
  canvaSchema,
  getDemoInventoryProduct,
  stockItems,
  stockProducts,
  type InventoryProduct,
} from "./mock";

/**
 * Local editor seed for inventory detail chrome.
 * Mock mode only; API/disabled return empty until SEL-240 wires schema/items.
 * Screens must not import ./mock directly (INT-170).
 * Uses getDomainSource (not shouldUseMockFixtures) so disabled does not throw in chrome.
 */
export function getInventoryDetailLocalSeed(): {
  fields: InventoryField[];
  stockItems: StockItem[];
} {
  if (getDomainSource("sellerCatalog") !== "mock") {
    return { fields: [], stockItems: [] };
  }
  return {
    fields: [...canvaSchema] as InventoryField[],
    stockItems: [...stockItems] as StockItem[],
  };
}

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
