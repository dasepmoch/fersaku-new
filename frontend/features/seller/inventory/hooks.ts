"use client";

import { useQueryClient } from "@tanstack/react-query";
import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import {
  getSellerInventoryDetail,
  getSellerInventoryProduct,
  getSellerInventorySchema,
  importSellerInventoryItems,
  listSellerInventory,
  putSellerInventorySchema,
  revealSellerInventoryItem,
  revokeSellerInventoryItem,
} from "./api";
import type {
  ImportInventoryItemsInput,
  PutInventorySchemaInput,
  RevealInventoryItemInput,
  RevokeInventoryItemInput,
} from "./contracts";
import {
  getDemoInventoryDetail,
  getDemoInventoryProduct,
  getDemoInventorySchema,
  stockProducts,
} from "./mock";

export function useSellerInventory(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.inventory(storeId),
    queryFn: (signal) => listSellerInventory(storeId, signal),
    enabled: Boolean(storeId),
    surface: "private",
    placeholderData: mockPlaceholderData("sellerCatalog", stockProducts),
  });
}

export function useSellerInventoryProduct(storeId: string, productId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.inventoryProduct(storeId, productId),
    queryFn: (signal) => getSellerInventoryProduct(storeId, productId, signal),
    enabled: Boolean(storeId && productId),
    surface: "private",
    placeholderData: mockPlaceholderData(
      "sellerCatalog",
      getDemoInventoryProduct(productId),
    ),
  });
}

/** Detail + masked items (no secrets). Separate from product summary key. */
export function useSellerInventoryDetail(storeId: string, productId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.inventoryProductDetail(storeId, productId),
    queryFn: (signal) => getSellerInventoryDetail(storeId, productId, signal),
    enabled: Boolean(storeId && productId),
    surface: "private",
    placeholderData: mockPlaceholderData(
      "sellerCatalog",
      getDemoInventoryDetail(productId),
    ),
  });
}

export function useSellerInventorySchema(storeId: string, productId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.inventorySchema(storeId, productId),
    queryFn: (signal) => getSellerInventorySchema(storeId, productId, signal),
    enabled: Boolean(storeId && productId),
    surface: "private",
    placeholderData: mockPlaceholderData(
      "sellerCatalog",
      getDemoInventorySchema(productId),
    ),
  });
}

function invalidateInventoryCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
  productId?: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.inventory(storeId),
  });
  if (productId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.seller.inventoryProduct(storeId, productId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.seller.inventoryProductDetail(storeId, productId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.seller.inventorySchema(storeId, productId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.seller.product(storeId, productId),
    });
  }
  void queryClient.invalidateQueries({
    queryKey: ["seller", storeId, "products"],
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.analyticsOverview(storeId),
  });
}

export function usePutSellerInventorySchemaMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "inventory", "schema"],
    mutationFn: (input: PutInventorySchemaInput, signal) =>
      putSellerInventorySchema(input, signal),
    onSuccess: (_schema, input) => {
      invalidateInventoryCaches(queryClient, input.storeId, input.productId);
    },
  });
}

export function useImportSellerInventoryItemsMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "inventory", "import"],
    mutationFn: (input: ImportInventoryItemsInput, signal) =>
      importSellerInventoryItems(input, signal),
    onSuccess: (_result, input) => {
      invalidateInventoryCaches(queryClient, input.storeId, input.productId);
    },
  });
}

/**
 * Reveal must NOT be cached in React Query.
 * Callers hold secrets in component state only + TTL cleanup.
 */
export function useRevealSellerInventoryItemMutation() {
  return useAppMutation({
    mutationKey: ["seller", "inventory", "reveal"],
    mutationFn: (input: RevealInventoryItemInput, signal) =>
      revealSellerInventoryItem(input, signal),
  });
}

export function useRevokeSellerInventoryItemMutation(storeId: string, productId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "inventory", productId, "revoke"],
    mutationFn: (input: Omit<RevokeInventoryItemInput, "storeId">, signal) =>
      revokeSellerInventoryItem({ ...input, storeId }, signal),
    onSuccess: () => {
      invalidateInventoryCaches(queryClient, storeId, productId);
    },
  });
}
