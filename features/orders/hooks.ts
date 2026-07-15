"use client";

import { isLiveApi } from "@/shared/data/mode";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { demoOrders, getSellerOrder, listSellerOrders } from "./api";

export function useSellerOrders(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.orders(storeId, {}),
    queryFn: (signal) => listSellerOrders(storeId, undefined, signal),
    placeholderData: isLiveApi()
      ? undefined
      : {
          items: demoOrders(),
          nextCursor: null,
          previousCursor: null,
          hasMore: false,
        },
  });
}

export function useSellerOrder(storeId: string, orderId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.order(storeId, orderId),
    queryFn: (signal) => getSellerOrder(storeId, orderId, signal),
    enabled: Boolean(orderId),
    placeholderData: isLiveApi()
      ? undefined
      : demoOrders().find((order) => order.id === orderId) || demoOrders()[0],
  });
}
