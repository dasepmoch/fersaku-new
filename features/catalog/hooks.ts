"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getSellerProduct,
  listSellerProducts,
  publishSellerProduct,
  type PublishProductInput,
} from "./api";
import { demoProducts } from "./mock";

export function useSellerProducts(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.products(storeId),
    queryFn: (signal) => listSellerProducts(storeId, signal),
    placeholderData: mockPlaceholderData("sellerCatalog", demoProducts),
  });
}

export function useSellerProduct(storeId: string, productId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.product(storeId, productId),
    queryFn: (signal) => getSellerProduct(storeId, productId, signal),
    enabled: Boolean(productId),
    placeholderData: mockPlaceholderData(
      "sellerCatalog",
      demoProducts.find((product) => product.id === productId) || null,
    ),
  });
}

export function usePublishSellerProductMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "products", "publish"],
    mutationFn: (input: PublishProductInput, signal) =>
      publishSellerProduct(input, signal),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.products(input.storeId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.product(input.storeId, input.productId),
      });
    },
  });
}
