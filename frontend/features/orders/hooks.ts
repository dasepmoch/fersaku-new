"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getSellerOrder,
  listSellerOrders,
  resendSellerOrderDelivery,
} from "./api";
import type { SellerOrderListFilters } from "./contracts";
import { demoOrders } from "./mock";

export function useSellerOrders(
  storeId: string,
  filters: SellerOrderListFilters = {},
) {
  const normalized: SellerOrderListFilters = {
    q: filters.q?.trim() || undefined,
    statusTab: filters.statusTab ?? "Semua",
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 5,
    source: filters.source,
    from: filters.from,
    to: filters.to,
  };
  return useAppQuery({
    queryKey: queryKeys.seller.orders(storeId, normalized as Record<string, unknown>),
    queryFn: (signal) => listSellerOrders(storeId, normalized, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerOperations", {
      items: demoOrders(),
      page: 1,
      pageSize: normalized.pageSize ?? 5,
      totalCount: demoOrders().length,
      pageCount: 1,
    }),
  });
}

export function useSellerOrder(storeId: string, orderId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.order(storeId, orderId),
    queryFn: (signal) => getSellerOrder(storeId, orderId, signal),
    enabled: Boolean(storeId && orderId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoOrders().find((order) => order.id === orderId) || null,
    ),
  });
}

/** Existing resend control only — no optimistic success; invalidates list/detail. */
export function useResendSellerOrderDelivery(storeId: string, orderId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "orders", orderId, "delivery-resend"],
    mutationFn: async (_variables: void, signal) => {
      const cached = queryClient.getQueryData(
        queryKeys.seller.order(storeId, orderId),
      ) as { internalOrderId?: string } | null | undefined;
      const internal = cached?.internalOrderId || orderId;
      return resendSellerOrderDelivery(storeId, internal, { signal });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.seller.order(storeId, orderId),
      });
      await queryClient.invalidateQueries({
        queryKey: ["seller", storeId, "orders"],
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.seller.analyticsOverview(storeId),
      });
    },
  });
}
