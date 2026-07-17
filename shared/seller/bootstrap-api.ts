/**
 * INT-150 — seller bootstrap transport (GET /v1/seller/me/merchant).
 */

import { apiRequest } from "@/shared/api/http-client";
import {
  sellerBootstrapEnvelopeSchema,
  sellerCurrentStoreEnvelopeSchema,
  type SellerBootstrapDto,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import { DEMO_STORE_ID } from "@/shared/config/demo";

export type SellerBootstrap = SellerBootstrapDto;

export function createMockSellerBootstrap(
  storeId: string = DEMO_STORE_ID,
): SellerBootstrap {
  return {
    merchantId: "merch_mock",
    displayName: "Mock Merchant",
    status: "ACTIVE",
    roleInMerchant: "OWNER",
    ownerUserId: "mock_seller",
    memberships: [
      {
        merchantId: "merch_mock",
        displayName: "Mock Merchant",
        merchantStatus: "ACTIVE",
        roleInMerchant: "OWNER",
        capabilities: ["store.read", "store.write"],
        storeIds: [storeId],
      },
    ],
    stores: [
      {
        storeId,
        merchantId: "merch_mock",
        slug: "mock-store",
        name: "Mock Store",
        status: "ACTIVE",
        canonical: true,
      },
    ],
    canonicalStoreId: storeId,
    currentStoreId: storeId,
    capabilities: ["store.read", "store.write"],
  };
}

export async function fetchSellerBootstrap(
  signal?: AbortSignal,
): Promise<SellerBootstrap> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return createMockSellerBootstrap();
  }
  const response = await apiRequest<ApiEnvelope<SellerBootstrapDto>>(
    "/v1/seller/me/merchant",
    { schema: sellerBootstrapEnvelopeSchema, signal },
  );
  return response.data;
}

export async function putSellerCurrentStore(
  storeId: string,
  signal?: AbortSignal,
): Promise<{ currentStoreId: string; canonicalStoreId: string }> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return { currentStoreId: storeId, canonicalStoreId: storeId };
  }
  const response = await apiRequest<
    ApiEnvelope<{ currentStoreId: string; canonicalStoreId?: string }>,
    { storeId: string }
  >("/v1/seller/me/current-store", {
    schema: sellerCurrentStoreEnvelopeSchema,
    method: "PUT",
    body: { storeId },
    signal,
  });
  return {
    currentStoreId: response.data.currentStoreId ?? storeId,
    canonicalStoreId: response.data.canonicalStoreId ?? storeId,
  };
}
