/**
 * PUB-110 — public active fee policy for marketing home/pricing copy.
 * Server fee policy is source of truth; checkout quote remains authoritative for money.
 */

import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  feePolicyEnvelopeSchema,
  type FeePolicyDto,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import { FERSAKU_FEE_POLICY } from "@/shared/finance/fee-policy";
import type { PublicFeeMarketingCopy } from "./contracts";
import { mapFeePolicyDtoToMarketingCopy } from "./mappers";

/** Public SSR cache for fee policy (versioned; invalidate on policy release). */
export const PUBLIC_FEE_REVALIDATE_SECONDS = 300;
export const PUBLIC_FEE_CACHE_TAG = "public-fee-policy";

/** Release-installed launch DTO — not marketing invention; matches BE LAUNCH_FEE_POLICY_V1. */
export const LAUNCH_FEE_POLICY_DTO: FeePolicyDto = {
  policyVersion: "LAUNCH_FEE_POLICY_V1",
  scope: "GLOBAL",
  transactionPercentBps: FERSAKU_FEE_POLICY.transactionRatePercent * 100,
  transactionFixedIdr: FERSAKU_FEE_POLICY.transactionProcessingFee,
  withdrawalPercentBps: FERSAKU_FEE_POLICY.withdrawalRatePercent * 100,
  minimumWithdrawalIdr: FERSAKU_FEE_POLICY.withdrawalMinimumAmount,
  immutable: true,
  currency: "IDR",
  adminMutationAllowed: false,
};

/** Process-local last successful public policy (outage: serve last known, never invent). */
let lastKnownFeePolicyDto: FeePolicyDto | null = null;

export function getLastKnownFeePolicyDto(): FeePolicyDto | null {
  return lastKnownFeePolicyDto;
}

/** Test helper — clear last-known cache. */
export function resetPublicFeePolicyCacheForTests(): void {
  lastKnownFeePolicyDto = null;
}

function rememberPolicy(dto: FeePolicyDto): void {
  lastKnownFeePolicyDto = dto;
}

/**
 * Active public fee policy DTO (schema-validated).
 * Mock → launch DTO; API → GET /v1/platform/fees; outage → last known then launch fallback.
 */
export async function getActiveFeePolicyDto(
  signal?: AbortSignal,
): Promise<{ dto: FeePolicyDto; source: PublicFeeMarketingCopy["source"] }> {
  if (shouldUseMockFixtures("publicCatalog")) {
    return { dto: LAUNCH_FEE_POLICY_DTO, source: "mock" };
  }

  try {
    const response = await apiRequest<{ data: FeePolicyDto }>(
      "/v1/platform/fees",
      {
        schema: feePolicyEnvelopeSchema,
        signal,
      },
    );
    rememberPolicy(response.data);
    return { dto: response.data, source: "api" };
  } catch (error) {
    if (lastKnownFeePolicyDto) {
      return { dto: lastKnownFeePolicyDto, source: "last_known" };
    }
    // Launch fallback is release-installed policy (shared with finance calc), not invented.
    if (error instanceof ApiError || error instanceof Error) {
      return { dto: LAUNCH_FEE_POLICY_DTO, source: "launch_fallback" };
    }
    return { dto: LAUNCH_FEE_POLICY_DTO, source: "launch_fallback" };
  }
}

/**
 * Marketing copy strings for home/pricing existing slots.
 * Never throws for transport outage — degrades to last known / launch policy.
 */
export async function getPublicFeeMarketingCopy(
  signal?: AbortSignal,
): Promise<PublicFeeMarketingCopy> {
  const { dto, source } = await getActiveFeePolicyDto(signal);
  return mapFeePolicyDtoToMarketingCopy(dto, source);
}
