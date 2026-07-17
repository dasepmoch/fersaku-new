"use client";

import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getBuyerProfile,
  getBuyerPurchase,
  listBuyerPurchases,
  listBuyerSessions,
  revokeBuyerSession,
  type RevokeBuyerSessionInput,
} from "./api";
import { demoProfile, demoPurchases, demoSessions } from "./mock";

export function useBuyerPurchases() {
  return useAppQuery({
    queryKey: queryKeys.buyer.purchases(),
    queryFn: (signal) => listBuyerPurchases(signal),
    placeholderData: mockPlaceholderData("buyer", demoPurchases()),
  });
}

export function useBuyerPurchase(orderId: string) {
  return useAppQuery({
    queryKey: queryKeys.buyer.purchase(orderId),
    queryFn: (signal) => getBuyerPurchase(orderId, signal),
    enabled: Boolean(orderId),
    placeholderData: mockPlaceholderData("buyer", demoPurchases().find((p) => p.orderId === orderId) || null),
  });
}

export function useBuyerProfile() {
  return useAppQuery({
    queryKey: queryKeys.buyer.profile(),
    queryFn: (signal) => getBuyerProfile(signal),
    placeholderData: mockPlaceholderData("buyer", demoProfile()),
  });
}

export function useBuyerSessions() {
  return useAppQuery({
    queryKey: queryKeys.buyer.sessions(),
    queryFn: (signal) => listBuyerSessions(signal),
    placeholderData: mockPlaceholderData("buyer", demoSessions()),
  });
}

export function useRevokeBuyerSessionMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["buyer", "sessions", "revoke"],
    mutationFn: (input: RevokeBuyerSessionInput, signal) =>
      revokeBuyerSession(input, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.buyer.sessions(),
      });
    },
  });
}
