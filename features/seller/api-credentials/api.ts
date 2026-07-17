/**
 * SEL-330 — seller QRIS API credentials + KYC capability adapters.
 * Domain gate: sellerOperations. Raw apiKey never enters query cache.
 * Separate from webhook signingSecret (SEL-320).
 */

import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  sellerApiCredentialClaimOfferEnvelopeSchema,
  sellerApiCredentialClaimRequestSchema,
  sellerApiCredentialEnvelopeSchema,
  sellerApiCredentialListEnvelopeSchema,
  sellerApiCredentialRequestSchema,
  sellerApiCredentialSecretClaimEnvelopeSchema,
  sellerKycCaseEnvelopeSchema,
  sellerKycCreateCaseRequestSchema,
  sellerKycStatusEnvelopeSchema,
  type SellerApiCredentialRequest,
  type SellerKycCreateCaseRequest,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  ApiCredentialClaimOffer,
  ApiKeyReveal,
  CreateKycCaseInput,
  RequestApiCredentialInput,
  SellerApiCredential,
  SellerKycCase,
  SellerKycStatus,
} from "./contracts";
import {
  mapApiCredentialDto,
  mapApiCredentialListDto,
  mapClaimOfferDto,
  mapKycCaseDto,
  mapKycStatusDto,
  mapSecretClaimDto,
  toCreateKycCaseBody,
  toRequestCredentialBody,
} from "./mappers";
import {
  demoApiCredentials,
  demoKycStatus,
  mockApiCredentialClaimOffer,
  mockApiKeyReveal,
  mockKycCase,
} from "./mock";

type ListEnvelope = z.infer<typeof sellerApiCredentialListEnvelopeSchema>;
type ClaimOfferEnvelope = z.infer<
  typeof sellerApiCredentialClaimOfferEnvelopeSchema
>;
type SecretClaimEnvelope = z.infer<
  typeof sellerApiCredentialSecretClaimEnvelopeSchema
>;
type CredentialEnvelope = z.infer<typeof sellerApiCredentialEnvelopeSchema>;
type KycStatusEnvelope = z.infer<typeof sellerKycStatusEnvelopeSchema>;
type KycCaseEnvelope = z.infer<typeof sellerKycCaseEnvelopeSchema>;

export function isSellerApiCredentialsApiDomain(): boolean {
  return getDomainSource("sellerOperations") === "api";
}

function useMock(): boolean {
  return shouldUseMockFixtures("sellerOperations");
}

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

/**
 * Store-scoped masked credential list (never raw apiKey / claimToken).
 * Foreign store → resource_not_found rethrow (safe 404).
 */
export async function listSellerApiCredentials(
  storeId: string,
  signal?: AbortSignal,
): Promise<SellerApiCredential[]> {
  if (useMock()) {
    return demoApiCredentials(storeId);
  }

  const response = await apiRequest<ListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/api-credentials`,
    {
      schema: sellerApiCredentialListEnvelopeSchema,
      signal,
    },
  );
  return mapApiCredentialListDto(response.data.credentials);
}

/**
 * Request issuance/rotation. May return claimToken once when AUTHORIZED.
 * MFA/recent proof forwarded per BE policy; never log mfaCode/token.
 */
export async function requestSellerApiCredential(
  storeId: string,
  input: RequestApiCredentialInput = {},
  signal?: AbortSignal,
): Promise<ApiCredentialClaimOffer> {
  if (useMock()) {
    return mockApiCredentialClaimOffer(
      storeId,
      input.paymentMode ?? "SANDBOX",
    );
  }

  const body = sellerApiCredentialRequestSchema.parse(
    toRequestCredentialBody(input),
  ) as SellerApiCredentialRequest;

  const response = await apiRequest<
    ClaimOfferEnvelope,
    SellerApiCredentialRequest
  >(`/v1/stores/${encodeURIComponent(storeId)}/api-credential-requests`, {
    method: "POST",
    body,
    schema: sellerApiCredentialClaimOfferEnvelopeSchema,
    signal,
    idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
  });
  return mapClaimOfferDto(response.data);
}

/**
 * One-time claim exchange. Raw apiKey returned only here — never cache.
 * claimId path segment is opaque; use "x" when unknown (BE resolves by token hash).
 */
export async function claimSellerApiCredential(
  storeId: string,
  claimToken: string,
  options: { claimId?: string; mfaCode?: string } = {},
  signal?: AbortSignal,
): Promise<ApiKeyReveal> {
  if (useMock()) {
    return mockApiKeyReveal(`apk_claimed_${Date.now()}`);
  }

  const body = sellerApiCredentialClaimRequestSchema.parse({
    token: claimToken,
    ...(options.mfaCode ? { mfaCode: options.mfaCode } : {}),
  });

  const claimId = options.claimId ?? "x";
  const response = await apiRequest<
    SecretClaimEnvelope,
    { token?: string; claimToken?: string; mfaCode?: string }
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/api-credential-claims/${encodeURIComponent(claimId)}/exchange`,
    {
      method: "POST",
      body,
      schema: sellerApiCredentialSecretClaimEnvelopeSchema,
      signal,
    },
  );
  return mapSecretClaimDto(response.data);
}

/**
 * Revoke credential. No optimistic success — server-authoritative masked result.
 */
export async function revokeSellerApiCredential(
  storeId: string,
  keyId: string,
  options: { reason?: string; mfaCode?: string } = {},
  signal?: AbortSignal,
): Promise<SellerApiCredential> {
  if (useMock()) {
    const existing =
      demoApiCredentials(storeId).find((c) => c.id === keyId) ??
      demoApiCredentials(storeId)[0]!;
    return {
      ...existing,
      id: keyId,
      status: "REVOKED",
      statusLabel: "Dicabut",
      revokedAt: new Date().toISOString(),
    };
  }

  const body =
    options.reason || options.mfaCode
      ? {
          ...(options.reason ? { reason: options.reason } : {}),
          ...(options.mfaCode ? { mfaCode: options.mfaCode } : {}),
        }
      : undefined;

  const response = await apiRequest<
    CredentialEnvelope,
    { reason?: string; mfaCode?: string } | undefined
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/api-credentials/${encodeURIComponent(keyId)}/revoke`,
    {
      method: "POST",
      body,
      schema: sellerApiCredentialEnvelopeSchema,
      signal,
      idempotencyKey: createIdempotencyKey(),
    },
  );
  return mapApiCredentialDto(response.data);
}

/** Seller KYC status for live QRIS API (storefront not gated). */
export async function getSellerKycStatus(
  signal?: AbortSignal,
): Promise<SellerKycStatus> {
  if (useMock()) {
    return demoKycStatus();
  }

  const response = await apiRequest<KycStatusEnvelope>(`/v1/me/kyc`, {
    schema: sellerKycStatusEnvelopeSchema,
    signal,
  });
  return mapKycStatusDto(response.data);
}

export async function createSellerKycCase(
  input: CreateKycCaseInput,
  signal?: AbortSignal,
): Promise<SellerKycCase> {
  if (useMock()) {
    return mockKycCase(input.legalName);
  }

  const body = sellerKycCreateCaseRequestSchema.parse(
    toCreateKycCaseBody(input),
  ) as SellerKycCreateCaseRequest;

  const response = await apiRequest<KycCaseEnvelope, SellerKycCreateCaseRequest>(
    `/v1/me/kyc/cases`,
    {
      method: "POST",
      body,
      schema: sellerKycCaseEnvelopeSchema,
      signal,
      idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
    },
  );
  return mapKycCaseDto(response.data);
}

export async function getSellerKycCase(
  caseId: string,
  signal?: AbortSignal,
): Promise<SellerKycCase> {
  if (useMock()) {
    return { ...mockKycCase("Demo"), id: caseId, status: "SUBMITTED", statusLabel: "menunggu review" };
  }

  const response = await apiRequest<KycCaseEnvelope>(
    `/v1/me/kyc/cases/${encodeURIComponent(caseId)}`,
    {
      schema: sellerKycCaseEnvelopeSchema,
      signal,
    },
  );
  return mapKycCaseDto(response.data);
}

export async function submitSellerKycCase(
  caseId: string,
  signal?: AbortSignal,
): Promise<SellerKycCase> {
  if (useMock()) {
    return {
      ...mockKycCase("Demo"),
      id: caseId,
      status: "SUBMITTED",
      statusLabel: "menunggu review",
    };
  }

  const response = await apiRequest<KycCaseEnvelope>(
    `/v1/me/kyc/cases/${encodeURIComponent(caseId)}/submit`,
    {
      method: "POST",
      schema: sellerKycCaseEnvelopeSchema,
      signal,
      idempotencyKey: createIdempotencyKey(),
    },
  );
  return mapKycCaseDto(response.data);
}

export function isApiCredentialNotFound(error: unknown): boolean {
  return isResourceNotFound(error);
}

export {
  demoApiCredentials,
  demoKycStatus,
  MOCK_API_KEY_RAW,
  MOCK_WEBHOOK_SECRET_RAW,
} from "./mock";
