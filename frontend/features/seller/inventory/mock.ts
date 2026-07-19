import {
  canvaSchema,
  stockItems,
  stockProducts,
} from "@/lib/inventory-mock-data";
import type {
  InventoryField,
  InventoryProduct,
  InventoryProductDetail,
  InventorySchemaView,
  StockItem,
} from "./contracts";

export { canvaSchema, stockItems, stockProducts };

export function getDemoInventoryProduct(id: string): InventoryProduct | null {
  const row = stockProducts.find((product) => product.id === id);
  if (!row) return null;
  return { ...row };
}

export function getDemoInventorySchema(
  productId: string,
): InventorySchemaView | null {
  const product = getDemoInventoryProduct(productId);
  if (!product) return null;
  return {
    id: `schema_${productId}`,
    productId,
    storeId: "demo_store",
    version: 1,
    fields: [...canvaSchema] as InventoryField[],
    delimiter: "|",
    checksum: "demo",
    createdAt: "2026-07-12T00:00:00Z",
  };
}

export function getDemoInventoryDetail(
  productId: string,
): InventoryProductDetail | null {
  const product = getDemoInventoryProduct(productId);
  if (!product) return null;
  return {
    product,
    items: [...stockItems] as StockItem[],
  };
}

export type { InventoryProduct, InventoryField, StockItem };
