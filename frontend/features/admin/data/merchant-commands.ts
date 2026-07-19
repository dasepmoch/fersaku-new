/**
 * ADM-200 — merchant status, API capability, credential support adapters.
 * Typed routes preferred over generic /v1/admin/actions for transition contract.
 * Domain: adminWrite for mutations; adminRead for credential list/finance.
 * Permissions: merchants.write (status/api-access), kyc.review (credential BE gate).
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  adminCredentialAuthorizeEnvelopeSchema,
  adminMerchantApiAccessUpdateEnvelopeSchema,
  adminMerchantCredentialsEnvelopeSchema,
  adminMerchantFinanceSummaryEnvelopeSchema,
  adminMerchantStatusUpdateEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { useAppMutation } from "@/shared/query/create-mutation";
import { queryKeys } from "@/shared/query/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AdminMaskedCredential,
  AdminMerchantApiAccessWire,
  AdminMerchantFinanceSummary,
  AdminMerchantStatusWire,
} from "./contracts";
import {
  humanizeMerchantApiAccess,
  humanizeMerchantStatus,
  mapAdminMaskedCredentialDto,
  mapAdminMerchantFinanceSummaryDto,
} from "./mappers";
import { appendMockAuditEvent } from "./mock-audit";
import { demoMerchants } from "./merchants";

type StatusEnvelope = z.infer<typeof adminMerchantStatusUpdateEnvelopeSchema>;
type ApiAccessEnvelope = z.infer<
  typeof adminMerchantApiAccessUpdateEnvelopeSchema
>;
type FinanceEnvelope = z.infer<
  typeof adminMerchantFinanceSummaryEnvelopeSchema
>;
type CredentialsEnvelope = z.infer<
  typeof adminMerchantCredentialsEnvelopeSchema
>;
type AuthorizeEnvelope = z.infer<typeof adminCredentialAuthorizeEnvelopeSchema>;

const MOCK_AS_OF = "2026-07-17T00:00:00Z";

export type UpdateMerchantStatusInput = {
  merchantId: string;
  /** Wire enum ACTIVE|SUSPENDED|CLOSED */
  status: AdminMerchantStatusWire;
  reason: string;
  idempotencyKey?: string;
};

export type UpdateMerchantApiAccessInput = {
  merchantId: string;
  /** Wire enum ACTIVE|SUSPENDED */
  status: AdminMerchantApiAccessWire;
  reason: string;
  idempotencyKey?: string;
};

export type AuthorizeMerchantCredentialInput = {
  merchantId: string;
  reason: string;
  /** authorize | rotate both map to BE authorize (no raw key). */
  mode?: "authorize" | "rotate";
  idempotencyKey?: string;
};

export type MerchantCommandResult = {
  merchantId: string;
  /** Display status for existing AdminStatus chrome after success. */
  displayStatus: string;
  requestId: string;
};

export type CredentialAuthorizeResult = {
  merchantId: string;
  accepted: boolean;
  requestId: string;
  /** Issuance metadata only — never raw key. */
  status?: string;
};

function isAdminWriteMock(): boolean {
  return shouldUseMockFixtures("adminWrite");
}

function isAdminReadMock(): boolean {
  return shouldUseMockFixtures("adminRead");
}

/** GET finance projection — merchants.read; money server-authoritative. */
export async function getMerchantFinanceSummary(
  merchantId: string,
  signal?: AbortSignal,
): Promise<AdminMerchantFinanceSummary | null> {
  if (!merchantId) return null;
  if (isAdminReadMock()) {
    const m = demoMerchants().find((row) => row.id === merchantId);
    if (!m) return null;
    return {
      merchantId: m.id,
      availableAmount: Math.trunc(m.volume * 0.22),
      pendingAmount: 0,
      heldAmount: 0,
      lifetimeGrossAmount: m.volume,
      lifetimeNetAmount: Math.trunc(m.volume * 0.96),
      asOf: MOCK_AS_OF,
    };
  }

  const response = await apiRequest<FinanceEnvelope>(
    `/v1/admin/merchants/${encodeURIComponent(merchantId)}/finance/summary`,
    {
      schema: adminMerchantFinanceSummaryEnvelopeSchema,
      signal,
    },
  );
  return mapAdminMerchantFinanceSummaryDto(
    response.data,
    response.meta.timestamp,
  );
}

/** GET masked credentials — never raw key; BE gate currently kyc.review. */
export async function listMerchantCredentials(
  merchantId: string,
  signal?: AbortSignal,
): Promise<AdminMaskedCredential[]> {
  if (!merchantId) return [];
  if (isAdminReadMock()) {
    return [
      {
        id: `key_mock_${merchantId}`,
        keyPrefix: "fsk_live_****",
        status: "ACTIVE",
        paymentMode: "LIVE",
        name: "Production",
        fingerprint: "mock-fp",
      },
    ];
  }

  const response = await apiRequest<CredentialsEnvelope>(
    `/v1/admin/merchants/${encodeURIComponent(merchantId)}/api-credentials`,
    {
      schema: adminMerchantCredentialsEnvelopeSchema,
      signal,
    },
  );
  return response.data.credentials.map(mapAdminMaskedCredentialDto);
}

/**
 * POST typed merchant lifecycle status (independent of API access).
 * Body status is wire enum; response status may be wire — humanized for UI.
 */
export async function updateMerchantStatus(
  input: UpdateMerchantStatusInput,
  signal?: AbortSignal,
): Promise<MerchantCommandResult> {
  const reason = input.reason.trim();
  if (reason.length < 12) {
    throw new Error("Reason must be at least 12 characters for audit");
  }
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "merchant.status.update",
      target: input.merchantId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      merchantId: input.merchantId,
      displayStatus: humanizeMerchantStatus(input.status),
      requestId: `mock_status_${input.merchantId}`,
    };
  }

  const response = await apiRequest<
    StatusEnvelope,
    { status: AdminMerchantStatusWire; reason: string }
  >(`/v1/admin/merchants/${encodeURIComponent(input.merchantId)}/status`, {
    schema: adminMerchantStatusUpdateEnvelopeSchema,
    method: "POST",
    body: { status: input.status, reason },
    signal,
    idempotencyKey,
    auditReason: reason,
    requireRecentMfa: true,
  });

  return {
    merchantId: input.merchantId,
    displayStatus: humanizeMerchantStatus(response.data.status),
    requestId: response.meta.requestId,
  };
}

/**
 * POST typed API capability (independent of merchant lifecycle status).
 */
export async function updateMerchantApiAccess(
  input: UpdateMerchantApiAccessInput,
  signal?: AbortSignal,
): Promise<MerchantCommandResult> {
  const reason = input.reason.trim();
  if (reason.length < 12) {
    throw new Error("Reason must be at least 12 characters for audit");
  }
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "merchant.api_access.update",
      target: input.merchantId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      merchantId: input.merchantId,
      displayStatus: humanizeMerchantApiAccess(input.status),
      requestId: `mock_api_access_${input.merchantId}`,
    };
  }

  const response = await apiRequest<
    ApiAccessEnvelope,
    { status: AdminMerchantApiAccessWire; reason: string }
  >(
    `/v1/admin/merchants/${encodeURIComponent(input.merchantId)}/api-access/status`,
    {
      schema: adminMerchantApiAccessUpdateEnvelopeSchema,
      method: "POST",
      body: { status: input.status, reason },
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );

  return {
    merchantId: input.merchantId,
    displayStatus: humanizeMerchantApiAccess(response.data.status),
    requestId: response.meta.requestId,
  };
}

/**
 * Authorize / rotate credential issuance — admin never receives raw key.
 * BE currently gates with kyc.review (registry split remains follow-up).
 */
export async function authorizeMerchantCredential(
  input: AuthorizeMerchantCredentialInput,
  signal?: AbortSignal,
): Promise<CredentialAuthorizeResult> {
  const reason = input.reason.trim();
  if (reason.length < 12) {
    throw new Error("Reason must be at least 12 characters for audit");
  }
  const mode = input.mode ?? "rotate";
  const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey();
  const pathSuffix = mode === "authorize" ? "authorize" : "rotate";

  if (isAdminWriteMock()) {
    appendMockAuditEvent({
      actor: "admin@fersaku.id",
      action: "merchant.api_credentials.rotate",
      target: input.merchantId,
      ip: "mock-admin-session",
      result: "Success",
      context: reason,
    });
    return {
      merchantId: input.merchantId,
      accepted: true,
      requestId: `mock_cred_${input.merchantId}`,
      status: "AUTHORIZED",
    };
  }

  const response = await apiRequest<AuthorizeEnvelope, { reason: string }>(
    `/v1/admin/merchants/${encodeURIComponent(input.merchantId)}/api-credentials/${pathSuffix}`,
    {
      schema: adminCredentialAuthorizeEnvelopeSchema,
      method: "POST",
      body: { reason },
      signal,
      idempotencyKey,
      auditReason: reason,
      requireRecentMfa: true,
    },
  );

  const raw = JSON.stringify(response.data);
  if (raw.includes("fsk_live_") || raw.includes("fsk_test_")) {
    throw new Error("Admin credential response must never include raw key");
  }

  return {
    merchantId: input.merchantId,
    accepted: true,
    requestId: response.meta.requestId,
    status:
      typeof response.data.status === "string"
        ? response.data.status
        : undefined,
  };
}

function invalidateMerchantKeys(
  queryClient: ReturnType<typeof useQueryClient>,
  merchantId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.merchant(merchantId),
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "merchants"],
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.merchantFinance(merchantId),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.admin.merchantCredentials(merchantId),
  });
  void queryClient.invalidateQueries({
    queryKey: ["admin", "audit-logs"],
  });
}

export function useUpdateMerchantStatusMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "merchant-status"],
    mutationFn: (input: UpdateMerchantStatusInput, signal) =>
      updateMerchantStatus(input, signal),
    onSuccess: (_data, vars) => {
      invalidateMerchantKeys(queryClient, vars.merchantId);
    },
  });
}

export function useUpdateMerchantApiAccessMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "merchant-api-access"],
    mutationFn: (input: UpdateMerchantApiAccessInput, signal) =>
      updateMerchantApiAccess(input, signal),
    onSuccess: (_data, vars) => {
      invalidateMerchantKeys(queryClient, vars.merchantId);
    },
  });
}

export function useAuthorizeMerchantCredentialMutation() {
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["admin", "merchant-credential-authorize"],
    mutationFn: (input: AuthorizeMerchantCredentialInput, signal) =>
      authorizeMerchantCredential(input, signal),
    onSuccess: (_data, vars) => {
      invalidateMerchantKeys(queryClient, vars.merchantId);
    },
  });
}

/** Whether merchant write mutations use live transport. */
export function isMerchantWriteApi(): boolean {
  return getDomainSource("adminWrite") === "api";
}
