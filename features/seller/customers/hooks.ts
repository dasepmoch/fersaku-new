"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { getSellerCustomer, listSellerCustomers } from "./api";
import { demoCustomers } from "./mock";

export function useSellerCustomers(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.customers(storeId),
    queryFn: (signal) => listSellerCustomers(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData("sellerOperations", demoCustomers()),
  });
}

export function useSellerCustomer(storeId: string, customerId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.customers(storeId).concat(customerId),
    queryFn: (signal) => getSellerCustomer(storeId, customerId, signal),
    enabled: Boolean(storeId && customerId),
    placeholderData: mockPlaceholderData("sellerOperations", demoCustomers().find((c) => c.id === customerId) || null),
  });
}
