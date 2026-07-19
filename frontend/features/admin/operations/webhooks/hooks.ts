"use client";

/**
 * ADM-350 hooks. Query cache holds redacted metadata only.
 */

import {
  claimsHavePermission,
  ADMIN_ACTION_PERMISSIONS,
} from "@/features/admin/config/permissions";
import {
  getDomainSource,
  mockPlaceholderData,
} from "@/shared/data/domain-source";
import { useSessionClaims } from "@/shared/auth/session-provider";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminProviderCallback,
  getAdminSellerWebhookDelivery,
  listAdminWebhookConsole,
  replayAdminProviderCallback,
  retryAdminSellerWebhookDelivery,
  type ReplayProviderCallbackInput,
  type RetrySellerWebhookDeliveryInput,
} from "./api";
import { demoAdminWebhooks } from "./mock";

function useAdminWebhooksReadEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminRead") === "mock") return true;
  return claimsHavePermission(claims?.permissions, "webhooks.read");
}

export function useAdminProviderCallbackReplayEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(
    claims?.permissions,
    ADMIN_ACTION_PERMISSIONS.providerCallbacksReplay,
  );
}

export function useAdminSellerWebhookRetryEnabled(): boolean {
  const claims = useSessionClaims();
  if (getDomainSource("adminWrite") === "mock") return true;
  return claimsHavePermission(
    claims?.permissions,
    ADMIN_ACTION_PERMISSIONS.sellerWebhookRetry,
  );
}

export function useAdminWebhookConsole() {
  const enabled = useAdminWebhooksReadEnabled();
  return useAppQuery({
    queryKey: queryKeys.admin.webhooks({ compose: "both" }),
    queryFn: (signal) => listAdminWebhookConsole(signal),
    surface: "private",
    keepPrevious: true,
    enabled,
    placeholderData: mockPlaceholderData("adminRead", {
      rows: demoAdminWebhooks(),
      callbackError: null,
      deliveryError: null,
    }),
  });
}

export function useAdminProviderCallback(callbackId: string) {
  const enabled = useAdminWebhooksReadEnabled();
  const id = callbackId.trim();
  return useAppQuery({
    queryKey: queryKeys.admin.providerCallback(id),
    queryFn: (signal) => getAdminProviderCallback(id, signal),
    surface: "private",
    enabled: enabled && Boolean(id),
  });
}

export function useAdminSellerWebhookDelivery(deliveryId: string) {
  const enabled = useAdminWebhooksReadEnabled();
  const id = deliveryId.trim();
  return useAppQuery({
    queryKey: queryKeys.admin.sellerWebhookDelivery(id),
    queryFn: (signal) => getAdminSellerWebhookDelivery(id, signal),
    surface: "private",
    enabled: enabled && Boolean(id),
  });
}

function invalidateWebhookCaches(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({
    queryKey: ["admin", "webhooks"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "provider-callbacks"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "seller-webhook-deliveries"],
  });
}

export function useReplayAdminProviderCallbackMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "provider-callbacks", "replay"],
    mutationFn: (input: ReplayProviderCallbackInput, signal) =>
      replayAdminProviderCallback(input, signal),
    onSuccess: () => {
      invalidateWebhookCaches(queryClient);
    },
  });
}

export function useRetryAdminSellerWebhookDeliveryMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "seller-webhook-deliveries", "retry"],
    mutationFn: (input: RetrySellerWebhookDeliveryInput, signal) =>
      retryAdminSellerWebhookDelivery(input, signal),
    onSuccess: () => {
      invalidateWebhookCaches(queryClient);
    },
  });
}
