"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { getSellerInventoryProduct, listSellerInventory } from "./api";
import { getDemoInventoryProduct, stockProducts } from "./mock";

export function useSellerInventory(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.inventory(storeId),
    queryFn: (signal) => listSellerInventory(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerCatalog", stockProducts),
  });
}

export function useSellerInventoryProduct(storeId: string, productId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.inventoryProduct(storeId, productId),
    queryFn: (signal) => getSellerInventoryProduct(storeId, productId, signal),
    enabled: Boolean(storeId && productId),
    placeholderData: mockPlaceholderData("sellerCatalog", getDemoInventoryProduct(productId)),
  });
}
