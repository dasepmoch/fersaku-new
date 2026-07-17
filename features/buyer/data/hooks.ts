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
  clearBuyerSessionAfterRevoke,
  createBuyerReview,
  getBuyerProfile,
  getBuyerPurchase,
  listBuyerPurchases,
  listBuyerSessions,
  patchBuyerReview,
  revokeAllBuyerSessions,
  revokeBuyerSession,
  revokeOtherBuyerSessions,
  type RevokeBuyerSessionInput,
} from "./api";
import type {
  BuyerPurchaseListFilters,
  CreateBuyerReviewInput,
  PatchBuyerReviewInput,
} from "./contracts";
import { demoProfile, demoPurchases, demoSessions } from "./mock";

function buyerSubjectKey(
  claims: { subjectId?: string; sessionId?: string } | null,
) {
  if (!claims?.subjectId) return "anon";
  return `${claims.subjectId}:${claims.sessionId ?? "session"}`;
}

function invalidateAfterBuyerReview(
  queryClient: ReturnType<typeof useQueryClient>,
  subject: string,
  productId?: string,
  orderId?: string,
  orderItemId?: string,
) {
  if (orderId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.buyer.purchase(subject, orderId),
    });
  }
  void queryClient.invalidateQueries({
    queryKey: ["buyer", subject, "purchases"],
  });
  if (orderItemId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.buyer.review(subject, orderItemId),
    });
  }
  if (productId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.public.productReviews(productId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.public.productReviewSummary(productId),
    });
  }
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

/** BUY-130: authoritative session list — no stale local copy. */
export function useBuyerSessions() {
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  return useAppQuery({
    queryKey: queryKeys.buyer.sessions(subject),
    queryFn: (signal) => listBuyerSessions(signal),
    surface: "private",
    placeholderData: mockPlaceholderData("buyer", demoSessions()),
    enabled: buyerQueryEnabled(Boolean(claims?.subjectId)),
  });
}

/**
 * BUY-130: single revoke — no optimistic removal.
 * Revoking current clears session/private cache and redirects.
 */
export function useRevokeBuyerSessionMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["buyer", subject, "sessions", "revoke"],
    mutationFn: (
      input: RevokeBuyerSessionInput,
      signal,
    ) =>
      revokeBuyerSession(
        {
          ...input,
          currentSessionId: claims?.sessionId,
        },
        signal,
      ),
    onSuccess: async (result) => {
      if (result.revokedCurrent) {
        await clearBuyerSessionAfterRevoke();
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.buyer.sessions(subject),
      });
    },
  });
}

/**
 * BUY-130: dedicated bulk revoke-others endpoint (never loop single revoke).
 * No optimistic removal; invalidate after success.
 */
export function useRevokeOtherBuyerSessionsMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["buyer", subject, "sessions", "revoke-others"],
    mutationFn: (_input: void, signal) => revokeOtherBuyerSessions(signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.buyer.sessions(subject),
      });
    },
  });
}

/**
 * BUY-130: revoke-all including current — clears cookie + private cache + redirect.
 * No optimistic removal.
 */
export function useRevokeAllBuyerSessionsMutation() {
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["buyer", subject, "sessions", "revoke-all"],
    mutationFn: (_input: void, signal) => revokeAllBuyerSessions(signal),
    onSuccess: async () => {
      await clearBuyerSessionAfterRevoke();
    },
  });
}

export type CreateBuyerReviewVariables = CreateBuyerReviewInput & {
  /** Display/route order id for purchase cache invalidation. */
  orderId?: string;
};

export type PatchBuyerReviewVariables = PatchBuyerReviewInput & {
  orderId?: string;
  productId?: string;
  orderItemId?: string;
};

/** BUY-110: create review — no optimistic publish; invalidate after server success. */
export function useCreateBuyerReviewMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["buyer", "reviews", "create"],
    mutationFn: (input: CreateBuyerReviewVariables, signal) =>
      createBuyerReview(input, signal),
    onSuccess: (review, variables) => {
      invalidateAfterBuyerReview(
        queryClient,
        subject,
        review.productId || variables.productId,
        variables.orderId,
        review.orderItemId || variables.orderItemId,
      );
    },
  });
}

/** BUY-110: patch review — 409 preserves form draft (no optimistic overwrite). */
export function usePatchBuyerReviewMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = buyerSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["buyer", "reviews", "patch"],
    mutationFn: (input: PatchBuyerReviewVariables, signal) =>
      patchBuyerReview(input, signal),
    onSuccess: (review, variables) => {
      invalidateAfterBuyerReview(
        queryClient,
        subject,
        review.productId || variables.productId,
        variables.orderId,
        review.orderItemId || variables.orderItemId,
      );
    },
  });
}
