/**
 * ADM-320 — typed force-fulfill / revoke on fulfillment screen only.
 * Permissions (BE): fulfillment.force.
 * Prefer domain routes over generic /v1/admin/actions.
 * No client secret mutation; grant state remains server-authoritative.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { adminDeliveryGrantEnvelopeSchema } from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { useAppMutation } from "@/shared/query/create-mutation";
import { queryKeys } from "@/shared/query/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminFulfillmentCommandResult } from "./contracts";
import { mapAdminDeliveryGrantCommandResult } from "./mappers";
import { appendMockAuditEvent } from "./mock-audit";

type GrantEnvelope = z.infer<typeof adminDeliveryGrantEnvelopeSchema>;

export type ForceFulfillAdminOrderInput = {
  orderId: string;
  reason: string;
  idempotencyKey?: string;
};

export type RevokeAdminDeliveryInput = {
  orderId: string;
  reason: string;
  idempotencyKey?: string;
};

function isAdminWriteMock(): boolean {
  return shouldUseMockFixtures("adminWrite");
}

/** Whether adminWrite domain is live API (for gate helpers). */
export function isFulfillmentWriteApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

/**
 * POST /v1/admin/orders/{orderId}/delivery/force-fulfill
 * BE: fulfillment.force + reason; never returns secrets.
 */
export async function forceFulfillAdminOrder(
  input: ForceFulfillAdminOrderInput,
  signal?: AbortSignal,
): Promise<AdminFulfillmentCommandResult> {
  const orderId = input.orderId.trim();
  const reason = input.reason.trim();
  if (!orderId) throw new Error("orderId required");
  if (reason.length < 12) throw new Error("reason required");

  const idem = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "order.delivery.force_fulfill",
      target: orderId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      grantId: `mock_grant_${orderId}`,
      orderId,
      status: "ACTIVE",
      requestId: `mock_force_${orderId}`,
    };
  }

  const response = await apiRequest<GrantEnvelope, { reason: string }>(
    `/v1/admin/orders/${encodeURIComponent(orderId)}/delivery/force-fulfill`,
    {
      schema: adminDeliveryGrantEnvelopeSchema,
      method: "POST",
      body: { reason },
      signal,
      idempotencyKey: idem,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );
  return mapAdminDeliveryGrantCommandResult(
    response.data,
    response.meta.requestId,
  );
}

/**
 * POST /v1/admin/orders/{orderId}/delivery/revoke
 * BE: fulfillment.force + reason.
 */
export async function revokeAdminDelivery(
  input: RevokeAdminDeliveryInput,
  signal?: AbortSignal,
): Promise<AdminFulfillmentCommandResult> {
  const orderId = input.orderId.trim();
  const reason = input.reason.trim();
  if (!orderId) throw new Error("orderId required");
  if (reason.length < 12) throw new Error("reason required");

  const idem = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "order.delivery.revoke",
      target: orderId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      grantId: `mock_grant_${orderId}`,
      orderId,
      status: "REVOKED",
      requestId: `mock_revoke_${orderId}`,
    };
  }

  const response = await apiRequest<GrantEnvelope, { reason: string }>(
    `/v1/admin/orders/${encodeURIComponent(orderId)}/delivery/revoke`,
    {
      schema: adminDeliveryGrantEnvelopeSchema,
      method: "POST",
      body: { reason },
      signal,
      idempotencyKey: idem,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );
  return mapAdminDeliveryGrantCommandResult(
    response.data,
    response.meta.requestId,
  );
}

function invalidateFulfillmentCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["admin", "fulfillment"],
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.order(orderId),
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "orders"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "audit-logs"],
  });
}

export function useForceFulfillAdminOrderMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "fulfillment", "force-fulfill"],
    mutationFn: (input: ForceFulfillAdminOrderInput, signal) =>
      forceFulfillAdminOrder(input, signal),
    onSuccess: (_data, input) => {
      invalidateFulfillmentCaches(queryClient, input.orderId);
    },
  });
}

export function useRevokeAdminDeliveryMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "fulfillment", "revoke"],
    mutationFn: (input: RevokeAdminDeliveryInput, signal) =>
      revokeAdminDelivery(input, signal),
    onSuccess: (_data, input) => {
      invalidateFulfillmentCaches(queryClient, input.orderId);
    },
  });
}
