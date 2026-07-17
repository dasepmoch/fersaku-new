import {
  canvaSchema,
  stockItems,
  stockProducts,
} from "@/lib/inventory-mock-data";
import type { InventoryField, StockItem } from "./contracts";

export type InventoryProduct = (typeof stockProducts)[number];

export { canvaSchema, stockItems, stockProducts };
export type { InventoryField, StockItem };

export function getDemoInventoryProduct(id: string): InventoryProduct | null {
  return stockProducts.find((product) => product.id === id) ?? null;
}
