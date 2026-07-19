"use client";

/**
 * Store object upload hooks (SEL-230).
 * Mutation keys never include uploadUrl / downloadUrl / checksum secrets.
 */

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import {
  completeStoreObjectUpload,
  createStoreObjectUpload,
  getStoreObjectMeta,
  runStoreObjectUpload,
} from "./api";
import type {
  CompleteStoreObjectUploadInput,
  CreateStoreObjectUploadInput,
  RunStoreObjectUploadInput,
  StoreObjectMeta,
} from "./contracts";

/** Metadata query — opaque ids only in key. */
export function useStoreObjectMeta(
  storeId: string,
  objectId: string | null | undefined,
) {
  return useAppQuery({
    queryKey: queryKeys.seller.objectMeta(storeId, objectId || "_"),
    queryFn: (signal) =>
      getStoreObjectMeta({ storeId, objectId: objectId as string }, signal),
    enabled: Boolean(storeId && objectId),
    surface: "private",
  });
}

/**
 * Presign only. Result includes short-lived uploadUrl for immediate PUT —
 * do not put intent into React Query cache.
 */
export function useCreateStoreObjectUploadMutation() {
  return useAppMutation({
    mutationKey: ["seller", "objects", "presign"],
    mutationFn: (input: CreateStoreObjectUploadInput, signal) =>
      createStoreObjectUpload(input, signal),
  });
}

/** Complete after successful direct PUT. */
export function useCompleteStoreObjectUploadMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "objects", "complete"],
    mutationFn: (input: CompleteStoreObjectUploadInput, signal) =>
      completeStoreObjectUpload(input, signal),
    onSuccess: (meta: StoreObjectMeta, input) => {
      void queryClient.setQueryData(
        queryKeys.seller.objectMeta(input.storeId, input.objectId),
        meta,
      );
    },
  });
}

/**
 * Full lifecycle for product/public asset dropzones.
 * Variables: storeId, purpose, file — no signed secrets in mutation key.
 */
export function useRunStoreObjectUploadMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", "objects", "upload"],
    mutationFn: (input: RunStoreObjectUploadInput, signal) =>
      runStoreObjectUpload(input, signal),
    onSuccess: (meta: StoreObjectMeta, input) => {
      void queryClient.setQueryData(
        queryKeys.seller.objectMeta(input.storeId, meta.id),
        meta,
      );
    },
  });
}
