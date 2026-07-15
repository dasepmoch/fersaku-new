"use client";

import { products } from "@/lib/mock-data";
import { isLiveApi } from "@/shared/data/mode";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { getSellerProduct, listSellerProducts } from "./api";

export function useSellerProducts(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.products(storeId),
    queryFn: (signal) => listSellerProducts(storeId, signal),
    placeholderData: isLiveApi() ? undefined : products,
  });
}

export function useSellerProduct(storeId: string, productId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.product(storeId, productId),
    queryFn: (signal) => getSellerProduct(storeId, productId, signal),
    enabled: Boolean(productId),
    placeholderData: isLiveApi()
      ? undefined
      : products.find((product) => product.id === productId) || null,
  });
}
