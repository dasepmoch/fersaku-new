"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { getSellerOrder, listSellerOrders } from "./api";
import { demoOrders } from "./mock";

export function useSellerOrders(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.orders(storeId, {}),
    queryFn: (signal) => listSellerOrders(storeId, undefined, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerOperations", {
      items: demoOrders(),
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
    }),
  });
}

export function useSellerOrder(storeId: string, orderId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.order(storeId, orderId),
    queryFn: (signal) => getSellerOrder(storeId, orderId, signal),
    enabled: Boolean(storeId && orderId),
    placeholderData: mockPlaceholderData("sellerOperations", demoOrders().find((order) => order.id === orderId) || null),
  });
}
