/**
 * ADM-300 — typed order delivery resend + payment provider lookup.
 * Prefer domain routes over generic /v1/admin/actions.
 * Permissions (BE): fulfillment.force (resend), payments.read (provider-lookup).
 * No client status mutation; money/state remain server-authoritative.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  adminDeliveryResendEnvelopeSchema,
  adminProviderLookupEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { useAppMutation } from "@/shared/query/create-mutation";
import { queryKeys } from "@/shared/query/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AdminDeliveryResendResult,
  AdminProviderLookupResult,
} from "./contracts";
import { mapAdminProviderLookupResultDto } from "./mappers";
import { appendMockAuditEvent } from "./mock-audit";

type ResendEnvelope = z.infer<typeof adminDeliveryResendEnvelopeSchema>;
type LookupEnvelope = z.infer<typeof adminProviderLookupEnvelopeSchema>;

export type ResendAdminOrderDeliveryInput = {
  orderId: string;
  reason: string;
  idempotencyKey?: string;
};

export type ProviderLookupInput = {
  paymentIntentId: string;
  reason: string;
  idempotencyKey?: string;
};

function isAdminWriteMock(): boolean {
  return shouldUseMockFixtures("adminWrite");
}

/** Whether adminWrite domain is live API (for gate helpers). */
export function isOrderPaymentWriteApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}

/**
 * POST /v1/admin/orders/{orderId}/delivery/resend
 * BE: fulfillment.force + reason + idempotency.
 */
export async function resendAdminOrderDelivery(
  input: ResendAdminOrderDeliveryInput,
  signal?: AbortSignal,
): Promise<AdminDeliveryResendResult> {
  const orderId = input.orderId.trim();
  const reason = input.reason.trim();
  if (!orderId) throw new Error("orderId required");
  if (!reason) throw new Error("reason required");

  const idem = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "order.delivery.resend",
      target: orderId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      accepted: true,
      requestId: `mock_resend_${orderId}`,
    };
  }

  const response = await apiRequest<
    ResendEnvelope,
    { reason: string; idempotencyKey: string }
  >(`/v1/admin/orders/${encodeURIComponent(orderId)}/delivery/resend`, {
    schema: adminDeliveryResendEnvelopeSchema,
    method: "POST",
    body: { reason, idempotencyKey: idem },
    signal,
    idempotencyKey: idem,
    auditReason: reason,
  });
  return {
    accepted: Boolean(response.data.accepted),
    requestId: response.meta.requestId,
  };
}

/**
 * POST /v1/admin/payments/{paymentIntentId}/provider-lookup
 * BE: payments.read; rate-limited; no client-chosen status.
 */
export async function providerLookupPayment(
  input: ProviderLookupInput,
  signal?: AbortSignal,
): Promise<AdminProviderLookupResult> {
  const paymentIntentId = input.paymentIntentId.trim();
  const reason = input.reason.trim();
  if (!paymentIntentId) throw new Error("paymentIntentId required");
  if (!reason) throw new Error("reason required");

  const idem = input.idempotencyKey?.trim() || createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "payment.provider.verify",
      target: paymentIntentId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      paymentIntentId,
      localStatus: "Pending",
      provider: "Xendit",
      providerReference: "mock-ref",
      lookup: "ACCEPTED",
      note: "mock lookup; no client-chosen status",
      requestId: `mock_lookup_${paymentIntentId}`,
    };
  }

  const response = await apiRequest<LookupEnvelope, { reason: string }>(
    `/v1/admin/payments/${encodeURIComponent(paymentIntentId)}/provider-lookup`,
    {
      schema: adminProviderLookupEnvelopeSchema,
      method: "POST",
      body: { reason },
      signal,
      idempotencyKey: idem,
      auditReason: reason,
    },
  );
  return mapAdminProviderLookupResultDto(
    response.data,
    response.meta.requestId,
  );
}

export function useResendAdminOrderDeliveryMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "orders", "delivery-resend"],
    mutationFn: (input: ResendAdminOrderDeliveryInput, signal) =>
      resendAdminOrderDelivery(input, signal),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.order(input.orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "orders"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "fulfillment"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "audit-logs"],
      });
    },
  });
}

export function useProviderLookupPaymentMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "payments", "provider-lookup"],
    mutationFn: (input: ProviderLookupInput, signal) =>
      providerLookupPayment(input, signal),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.payment(input.paymentIntentId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "payments"],
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.paymentMismatches(),
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "orders"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "audit-logs"],
      });
    },
  });
}
