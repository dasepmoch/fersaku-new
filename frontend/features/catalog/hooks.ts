"use client";

import { useEffect, useState } from "react";
import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  archiveSellerProduct,
  createSellerProduct,
  getSellerProduct,
  listSellerProducts,
  patchSellerProduct,
  publishSellerProduct,
} from "./api";
import type {
  ArchiveSellerProductInput,
  CreateSellerProductInput,
  PatchSellerProductInput,
  PublishSellerProductInput,
  SellerProductListFilters,
} from "./contracts";
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

/** Exact invalidation after product commands (list/detail/overview). */
function invalidateSellerProductCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
  productId?: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["seller", storeId, "products"],
  });
  if (productId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.seller.product(storeId, productId),
    });
  }
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.analyticsOverview(storeId),
  });
  void queryClient.invalidateQueries({
    queryKey: ["seller", storeId, "analytics"],
  });
}

export function useCreateSellerProductMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "products", "create"],
    mutationFn: (input: CreateSellerProductInput, signal) =>
      createSellerProduct(input, signal),
    onSuccess: (product, input) => {
      invalidateSellerProductCaches(queryClient, input.storeId, product.id);
    },
  });
}

export function usePatchSellerProductMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "products", "patch"],
    mutationFn: (input: PatchSellerProductInput, signal) =>
      patchSellerProduct(input, signal),
    onSuccess: (product, input) => {
      invalidateSellerProductCaches(
        queryClient,
        input.storeId,
        product.id || input.productId,
      );
    },
  });
}

export function usePublishSellerProductMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "products", "publish"],
    mutationFn: (input: PublishSellerProductInput, signal) =>
      publishSellerProduct(input, signal),
    onSuccess: (result, input) => {
      invalidateSellerProductCaches(
        queryClient,
        input.storeId,
        result.productId || input.productId,
      );
    },
  });
}

export function useArchiveSellerProductMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "products", "archive"],
    mutationFn: (input: ArchiveSellerProductInput, signal) =>
      archiveSellerProduct(input, signal),
    onSuccess: (product, input) => {
      invalidateSellerProductCaches(
        queryClient,
        input.storeId,
        product.id || input.productId,
      );
    },
  });
}
