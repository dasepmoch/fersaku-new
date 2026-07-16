import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";
import type {
  AdminInventoryField,
  AdminStockItem,
  AdminStockProduct,
} from "./contracts";
import { mockInventorySchema, mockStockItems, mockStockProducts } from "./mock";

export type AdminInventorySnapshot = {
  products: AdminStockProduct[];
  items: AdminStockItem[];
  schema: AdminInventoryField[];
};

export function demoInventory(): AdminInventorySnapshot {
  return {
    products: mockStockProducts(),
    items: mockStockItems(),
    schema: mockInventorySchema(),
  };
}

export async function getInventory(
  signal?: AbortSignal,
): Promise<AdminInventorySnapshot> {
  if (!isLiveApi()) return demoInventory();
  const response = await apiRequest<ApiEnvelope<AdminInventorySnapshot>>(
    "/v1/admin/inventory",
    { signal },
  );
  return response.data;
}
