"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useAppQuery } from "@/shared/query/create-query";
import { queryKeys } from "@/shared/query/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  getStorefrontStudio,
  publishStorefrontDraft,
  saveStorefrontDraft,
} from "./api";
import type {
  PublishStorefrontInput,
  SaveStorefrontDraftInput,
  StorefrontStudio,
} from "./contracts";
import { readStorefrontDraft } from "./draft";

function mockStudioPlaceholder(storeId: string): StorefrontStudio {
  const draft = readStorefrontDraft();
  return {
    storeId: storeId || "store_demo_asep",
    draftRevision: 14,
    draftETag: 'W/"mock_storefront_draft_14"',
    config: draft.config,
    logoStyle: draft.logoStyle,
    publishedRevision: 13,
    publishedETag: 'W/"mock_storefront_pub_13"',
    publishedAt: null,
  };
}

export function useStorefrontStudio(storeId: string | null | undefined) {
  const id = storeId ?? "";
  return useAppQuery({
    queryKey: queryKeys.seller.storefront(id),
    queryFn: (signal) => getStorefrontStudio(id, signal),
    enabled: Boolean(storeId),
    surface: "private",
    placeholderData: mockPlaceholderData(
      "sellerCatalog",
      mockStudioPlaceholder(id),
    ),
  });
}

function invalidateStorefront(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.storefront(storeId),
  });
}

/** Debounced draft save — no optimistic overwrite of local builder state. */
export function useSaveStorefrontDraftMutation(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "storefront", "draft"],
    mutationFn: async (input: SaveStorefrontDraftInput, signal) =>
      saveStorefrontDraft(input, signal),
    onSuccess: async () => {
      invalidateStorefront(queryClient, storeId);
    },
  });
}

/** Publish with expectedRevision; never optimistic success. */
export function usePublishStorefrontMutation(storeId?: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId ?? "unknown", "storefront", "publish"],
    mutationFn: async (input: PublishStorefrontInput, signal) =>
      publishStorefrontDraft(input, signal),
    onSuccess: async (_data, variables) => {
      invalidateStorefront(queryClient, variables.storeId);
      void queryClient.invalidateQueries({
        queryKey: ["seller", variables.storeId, "products"],
      });
    },
  });
}
