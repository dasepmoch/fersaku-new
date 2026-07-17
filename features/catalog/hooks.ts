"use client";

import { useEffect, useState } from "react";
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
import type { SellerProductListFilters } from "./contracts";
import { normalizeProductSearch } from "./mappers";
import { demoProducts } from "./mock";

const SEARCH_DEBOUNCE_MS = 300;

/** Debounce search string for list query key (cancel via React Query signal). */
export function useDebouncedProductSearch(q: string, ms = SEARCH_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), ms);
    return () => window.clearTimeout(t);
  }, [q, ms]);
  return debounced;
}

export function useSellerProducts(
  storeId: string,
  filters?: SellerProductListFilters,
) {
  const q = normalizeProductSearch(filters?.q);
  const status = filters?.status ?? "all";
  const type = filters?.type ?? "all";
  const listFilters: SellerProductListFilters = { q, status, type };

  return useAppQuery({
    queryKey: queryKeys.seller.products(storeId, listFilters),
    queryFn: (signal) => listSellerProducts(storeId, signal, listFilters),
    enabled: Boolean(storeId),
    surface: "private",
    keepPrevious: true,
    placeholderData: mockPlaceholderData("sellerCatalog", demoProducts),
  });
}

export function useSellerProduct(storeId: string, productId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.product(storeId, productId),
    queryFn: (signal) => getSellerProduct(storeId, productId, signal),
    enabled: Boolean(storeId && productId),
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
        queryKey: ["seller", input.storeId, "products"],
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.product(input.storeId, input.productId),
      });
    },
  });
}
