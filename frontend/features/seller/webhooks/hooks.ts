"use client";

/**
 * SEL-320 hooks. Query cache holds masked endpoints/deliveries only.
 * claimToken / signingSecret stay in component state via mutation result.
 */

import { useEffect, useRef, useState } from "react";
import { mockPlaceholderData } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  claimSellerWebhookSecret,
  createSellerWebhook,
  listSellerWebhookDeliveries,
  listSellerWebhooks,
  rotateSellerWebhookSecret,
  testSellerWebhook,
  updateSellerWebhook,
} from "./api";
import type {
  CreateSellerWebhookInput,
  UpdateSellerWebhookInput,
  WebhookSigningSecretReveal,
} from "./contracts";
import { demoWebhookDeliveries, demoWebhookEndpoints } from "./mock";

const SECRET_REVEAL_TTL_MS = 5 * 60_000;

function invalidateWebhooks(
  queryClient: ReturnType<typeof useQueryClient>,
  storeId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.webhooks(storeId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.seller.webhookDeliveries(storeId),
  });
}

export function useSellerWebhooks(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.webhooks(storeId),
    queryFn: (signal) => listSellerWebhooks(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoWebhookEndpoints(storeId || "demo"),
    ),
  });
}

export function useSellerWebhookDeliveries(storeId: string) {
  return useAppQuery({
    queryKey: queryKeys.seller.webhookDeliveries(storeId),
    queryFn: (signal) => listSellerWebhookDeliveries(storeId, signal),
    enabled: Boolean(storeId),
    placeholderData: mockPlaceholderData(
      "sellerOperations",
      demoWebhookDeliveries(storeId || "demo"),
    ),
  });
}

export function useCreateSellerWebhook(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "webhooks", "create"],
    mutationFn: async (input: CreateSellerWebhookInput, signal) =>
      createSellerWebhook(storeId, input, signal),
    onSuccess: async () => {
      invalidateWebhooks(queryClient, storeId);
    },
  });
}

export function useUpdateSellerWebhook(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "webhooks", "update"],
    mutationFn: async (
      variables: UpdateSellerWebhookInput & { endpointId: string },
      signal,
    ) => {
      const { endpointId, ...input } = variables;
      return updateSellerWebhook(storeId, endpointId, input, signal);
    },
    onSuccess: async () => {
      invalidateWebhooks(queryClient, storeId);
    },
  });
}

export function useRotateSellerWebhookSecret(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "webhooks", "rotate"],
    mutationFn: async (endpointId: string, signal) =>
      rotateSellerWebhookSecret(storeId, endpointId, signal),
    onSuccess: async () => {
      invalidateWebhooks(queryClient, storeId);
    },
  });
}

export function useClaimSellerWebhookSecret(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "webhooks", "claim"],
    mutationFn: async (
      variables: { endpointId: string; claimToken: string; claimId?: string },
      signal,
    ) =>
      claimSellerWebhookSecret(
        storeId,
        variables.endpointId,
        variables.claimToken,
        variables.claimId ?? "x",
        signal,
      ),
    onSuccess: async () => {
      invalidateWebhooks(queryClient, storeId);
    },
  });
}

export function useTestSellerWebhook(storeId: string) {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["seller", storeId, "webhooks", "test"],
    mutationFn: async (endpointId: string, signal) =>
      testSellerWebhook(storeId, endpointId, signal),
    onSuccess: async () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seller.webhookDeliveries(storeId),
      });
    },
  });
}

/**
 * Component-local one-time secret reveal with TTL + visibility/unmount clear.
 * Never put reveal into React Query or storage.
 */
export function useWebhookSecretRevealMemory() {
  const [reveal, setReveal] = useState<WebhookSigningSecretReveal | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setReveal(null);
  };

  const hold = (next: WebhookSigningSecretReveal) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setReveal(next);
    timerRef.current = setTimeout(clear, SECRET_REVEAL_TTL_MS);
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") clear();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clear();
    };
  }, []);

  return { reveal, hold, clear };
}
