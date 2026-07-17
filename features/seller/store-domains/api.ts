/**
 * SEL-310 — store custom domain transport adapters.
 * Domain gate: sellerOperations.
 * Real DNS/edge adapters are still fake on BE (INT-180) — API mode wires CRUD;
 * live rollout of custom domain remains dispositioned until real providers.
 * verificationToken is one-time and never cached in query keys.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  storeDomainCreateRequestSchema,
  storeDomainDeleteRequestSchema,
  storeDomainEnvelopeSchema,
  storeDomainListEnvelopeSchema,
  storeDomainVerifyRequestSchema,
  type StoreDomainCreateRequest,
  type StoreDomainDeleteRequest,
  type StoreDomainVerifyRequest,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  CreateStoreDomainInput,
  DeleteStoreDomainInput,
  StoreDomain,
  StoreDomainCreateResult,
  VerifyStoreDomainInput,
} from "./contracts";
import { mapStoreDomainDto, mapStoreDomainListDto } from "./mappers";
import { demoStoreDomains, mockCreateStoreDomain } from "./mock";

type ListEnvelope = z.infer<typeof storeDomainListEnvelopeSchema>;
type DomainEnvelope = z.infer<typeof storeDomainEnvelopeSchema>;

export function isSellerStoreDomainsApiDomain(): boolean {
  return getDomainSource("sellerOperations") === "api";
}

function useMock(): boolean {
  return shouldUseMockFixtures("sellerOperations");
}

/**
 * List custom domains for store (no verification tokens).
 * GET /v1/stores/{storeId}/domains
 */
export async function listStoreDomains(
  storeId: string,
  signal?: AbortSignal,
): Promise<StoreDomain[]> {
  if (!storeId) return [];
  if (useMock()) return demoStoreDomains(storeId);

  const response = await apiRequest<ListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/domains`,
    {
      schema: storeDomainListEnvelopeSchema,
      signal,
    },
  );
  return mapStoreDomainListDto(response.data);
}

/**
 * Claim hostname. Returns one-time verificationToken (component-local only).
 * POST /v1/stores/{storeId}/domains
 */
export async function createStoreDomain(
  storeId: string,
  input: CreateStoreDomainInput,
  signal?: AbortSignal,
): Promise<StoreDomainCreateResult> {
  const hostname = input.hostname.trim();
  if (!hostname) {
    throw new Error("hostname required");
  }

  if (useMock()) {
    return mockCreateStoreDomain(storeId, hostname);
  }

  const body: StoreDomainCreateRequest = storeDomainCreateRequestSchema.parse({
    hostname,
  });

  const response = await apiRequest<DomainEnvelope, StoreDomainCreateRequest>(
    `/v1/stores/${encodeURIComponent(storeId)}/domains`,
    {
      schema: storeDomainEnvelopeSchema,
      method: "POST",
      body,
      signal,
      idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
    },
  );

  const token = response.data.verificationToken?.trim();
  // Strip token from list-safe domain view.
  const { verificationToken: _t, ...rest } = response.data;
  void _t;
  return {
    domain: mapStoreDomainDto(rest),
    verificationToken: token || undefined,
  };
}

/**
 * Verify DNS TXT proof. Idempotent when already ACTIVE.
 * POST /v1/stores/{storeId}/domains/{domainId}/verify
 */
export async function verifyStoreDomain(
  storeId: string,
  input: VerifyStoreDomainInput,
  signal?: AbortSignal,
): Promise<StoreDomain> {
  if (useMock()) {
    const base =
      demoStoreDomains(storeId).find((d) => d.id === input.domainId) ??
      demoStoreDomains(storeId)[0]!;
    return {
      ...base,
      id: input.domainId,
      status: "ACTIVE",
      tlsStatus: "ACTIVE",
      statusLabel: "Connected",
      detailLabel: "DNS verified · TLS active",
      connected: true,
      version: base.version + 1,
    };
  }

  const body: StoreDomainVerifyRequest = storeDomainVerifyRequestSchema.parse({
    verificationToken: input.verificationToken,
    expectedVersion: input.expectedVersion,
  });

  const response = await apiRequest<DomainEnvelope, StoreDomainVerifyRequest>(
    `/v1/stores/${encodeURIComponent(storeId)}/domains/${encodeURIComponent(input.domainId)}/verify`,
    {
      schema: storeDomainEnvelopeSchema,
      method: "POST",
      body,
      signal,
      idempotencyKey: createIdempotencyKey(),
    },
  );
  const { verificationToken: _t, ...rest } = response.data;
  void _t;
  return mapStoreDomainDto(rest);
}

/**
 * Remove domain (edge teardown + tombstone cooldown on BE).
 * DELETE /v1/stores/{storeId}/domains/{domainId}
 */
export async function deleteStoreDomain(
  storeId: string,
  input: DeleteStoreDomainInput,
  signal?: AbortSignal,
): Promise<StoreDomain> {
  if (useMock()) {
    const base =
      demoStoreDomains(storeId).find((d) => d.id === input.domainId) ??
      demoStoreDomains(storeId)[0]!;
    return {
      ...base,
      id: input.domainId,
      status: "TOMBSTONED",
      tlsStatus: "REMOVED",
      statusLabel: "Removed",
      detailLabel: "Domain removed",
      connected: false,
      version: base.version + 1,
    };
  }

  const body: StoreDomainDeleteRequest | undefined =
    input.expectedVersion != null
      ? storeDomainDeleteRequestSchema.parse({
          expectedVersion: input.expectedVersion,
        })
      : undefined;

  const response = await apiRequest<
    DomainEnvelope,
    StoreDomainDeleteRequest | undefined
  >(
    `/v1/stores/${encodeURIComponent(storeId)}/domains/${encodeURIComponent(input.domainId)}`,
    {
      schema: storeDomainEnvelopeSchema,
      method: "DELETE",
      body,
      signal,
    },
  );
  const { verificationToken: _t, ...rest } = response.data;
  void _t;
  return mapStoreDomainDto(rest);
}

/**
 * Get single domain detail (no token hash).
 * GET /v1/stores/{storeId}/domains/{domainId}
 */
export async function getStoreDomain(
  storeId: string,
  domainId: string,
  signal?: AbortSignal,
): Promise<StoreDomain> {
  if (useMock()) {
    const hit = demoStoreDomains(storeId).find((d) => d.id === domainId);
    return hit ?? demoStoreDomains(storeId)[0]!;
  }

  const response = await apiRequest<DomainEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/domains/${encodeURIComponent(domainId)}`,
    {
      schema: storeDomainEnvelopeSchema,
      signal,
    },
  );
  const { verificationToken: _t, ...rest } = response.data;
  void _t;
  return mapStoreDomainDto(rest);
}
