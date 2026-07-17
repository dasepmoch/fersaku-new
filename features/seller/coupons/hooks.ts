"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  activateSellerCoupon,
  archiveSellerCoupon,
  createSellerCoupon,
  getSellerCoupon,
  listSellerCoupons,
  patchSellerCoupon,
  pauseSellerCoupon,
} from "./api";
import type {
  CreateSellerCouponInput,
  PatchSellerCouponInput,
} from "./contracts";
import { demoCoupons } from "./mock";

function invalidateCoupons(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
  couponId?: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.coupons(storeId),
  });
  if (couponId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.seller.coupon(storeId, couponId),
    });
  }
}

export function useSellerCoupons(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.coupons(storeId),
    queryFn: (signal) => listSellerCoupons(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoCoupons(storeId || "demo"),
    ),
  });
}

export function useSellerCoupon(storeId: string, couponId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.coupon(storeId, couponId),
    queryFn: (signal) => getSellerCoupon(storeId, couponId, signal),
    enabled: Boolean(storeId && couponId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoCoupons(storeId || "demo").find((c) => c.id === couponId) ?? null,
    ),
  });
}

/** Create draft; caller may chain activate. No optimistic list insert. */
export function useCreateSellerCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "coupons", "create"],
    mutationFn: async (input: CreateSellerCouponInput, signal) =>
      createSellerCoupon(storeId, input, signal),
    onSuccess: async (data) => {
      invalidateCoupons(queryClient, storeId, data.id);
    },
  });
}

export function usePatchSellerCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "coupons", "patch"],
    mutationFn: async (
      variables: PatchSellerCouponInput & { couponId: string },
      signal,
    ) => {
      const { couponId, ...input } = variables;
      return patchSellerCoupon(storeId, couponId, input, signal);
    },
    onSuccess: async (data) => {
      invalidateCoupons(queryClient, storeId, data.id);
    },
  });
}

export function useActivateSellerCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "coupons", "activate"],
    mutationFn: async (couponId: string, signal) =>
      activateSellerCoupon(storeId, couponId, signal),
    onSuccess: async (data) => {
      invalidateCoupons(queryClient, storeId, data.id);
    },
  });
}

export function usePauseSellerCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "coupons", "pause"],
    mutationFn: async (couponId: string, signal) =>
      pauseSellerCoupon(storeId, couponId, signal),
    onSuccess: async (data) => {
      invalidateCoupons(queryClient, storeId, data.id);
    },
  });
}

export function useArchiveSellerCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "coupons", "archive"],
    mutationFn: async (couponId: string, signal) =>
      archiveSellerCoupon(storeId, couponId, signal),
    onSuccess: async (data) => {
      invalidateCoupons(queryClient, storeId, data.id);
    },
  });
}
