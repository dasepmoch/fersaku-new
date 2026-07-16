import {
  canvaSchema,
  stockItems,
  stockProducts,
  type InventoryField,
  type StockItem,
} from "@/lib/inventory-mock-data";

export type InventoryProduct = (typeof stockProducts)[number];

export { canvaSchema, stockItems, stockProducts };
export type { InventoryField, StockItem };

export function getDemoInventoryProduct(id: string): InventoryProduct | null {
  return stockProducts.find((product) => product.id === id) ?? null;
}
