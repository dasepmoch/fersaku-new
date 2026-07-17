"use client";

import {
  getDomainSource,
  mockPlaceholderData,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionClaims } from "@/shared/auth/session-provider";
import {
  getBuyerProfile,
  getBuyerPurchase,
  listBuyerPurchases,
  listBuyerSessions,
  revokeBuyerSession,
  type RevokeBuyerSessionInput,
} from "./api";
import type { BuyerPurchaseListFilters } from "./contracts";
import { demoProfile, demoPurchases, demoSessions } from "./mock";

function buyerSubjectKey(
  claims: { subjectId?: string; sessionId?: string } | null,
) {
  if (!claims?.subjectId) return "anon";
  return `${claims.subjectId}:${claims.sessionId ?? "session"}`;
}

function buyerQueryEnabled(hasSubject: boolean): boolean {
  if (getDomainSource("buyer") === "mock") return true;
  return hasSubject;
}

export function useBuyerPurchases(filters?: BuyerPurchaseListFilters) {
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  const q = filters?.q ?? "";
  const filter = filters?.filter ?? "Semua";
  return useAppQuery({
    queryKey: queryKeys.buyer.purchases(subject, { q, filter }),
    queryFn: (signal) => listBuyerPurchases(signal, { q, filter }),
    surface: "private",
    keepPrevious: true,
    placeholderData: mockPlaceholderData("buyer", demoPurchases()),
    enabled: buyerQueryEnabled(Boolean(claims?.subjectId)),
  });
}

export function useBuyerPurchase(orderId: string) {
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  return useAppQuery({
    queryKey: queryKeys.buyer.purchase(subject, orderId),
    queryFn: (signal) => getBuyerPurchase(orderId, signal),
    surface: "private",
    enabled:
      Boolean(orderId) && buyerQueryEnabled(Boolean(claims?.subjectId)),
    placeholderData: mockPlaceholderData(
      "buyer",
      demoPurchases().find((p) => p.orderId === orderId) || null,
    ),
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
