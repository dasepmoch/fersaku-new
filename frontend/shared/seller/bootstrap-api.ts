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
  options?: { onboardingCompleted?: boolean; onboardingState?: string },
): SellerBootstrap {
  const completed = options?.onboardingCompleted !== false;
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
        storeIds: storeId ? [storeId] : [],
      },
    ],
    stores: storeId
      ? [
          {
            storeId,
            merchantId: "merch_mock",
            slug: "mock-store",
            name: "Mock Store",
            status: "ACTIVE",
            canonical: true,
          },
        ]
      : [],
    canonicalStoreId: storeId || undefined,
    currentStoreId: storeId || undefined,
    capabilities: ["store.read", "store.write"],
    onboardingState:
      options?.onboardingState ?? (completed ? "COMPLETE" : "NOT_STARTED"),
    onboardingCompleted: completed && Boolean(storeId),
  };
}

/** Pure selection: preferred if allowed → canonical → first stable allowed. */
export function selectCurrentStoreId(input: {
  preferred?: string | null;
  canonical?: string | null;
  allowedStoreIds: readonly string[];
}): string {
  const allowed = new Set(input.allowedStoreIds.filter(Boolean));
  const preferred = input.preferred?.trim() ?? "";
  if (preferred && allowed.has(preferred)) return preferred;
  const canonical = input.canonical?.trim() ?? "";
  if (canonical && allowed.has(canonical)) return canonical;
  return input.allowedStoreIds.find(Boolean) ?? "";
}

/**
 * Workspace needs completed onboarding + a membership-owned current store.
 * Incomplete / no-store → redirect to /dashboard/onboarding (server-authoritative).
 */
export function needsSellerOnboarding(boot: SellerBootstrap | null): boolean {
  if (!boot) return true;
  if (boot.onboardingCompleted === true) {
    return !(boot.currentStoreId?.trim() || boot.canonicalStoreId?.trim());
  }
  if (boot.onboardingCompleted === false) return true;
  // Legacy responses without the flag: treat missing store as incomplete.
  const storeId =
    boot.currentStoreId?.trim() ||
    boot.canonicalStoreId?.trim() ||
    boot.stores?.[0]?.storeId ||
    "";
  if (!storeId) return true;
  const state = (boot.onboardingState ?? "").toUpperCase();
  if (state && state !== "COMPLETE") return true;
  return false;
}

/** Reject client preference not present in membership store set (canonical-only launch). */
export function isAllowedSellerStoreId(
  boot: SellerBootstrap | null | undefined,
  storeId: string,
): boolean {
  if (!boot || !storeId) return false;
  const allowed = new Set(
    (boot.stores ?? []).map((s) => s.storeId).filter(Boolean),
  );
  for (const m of boot.memberships ?? []) {
    for (const id of m.storeIds ?? []) {
      if (id) allowed.add(id);
    }
  }
  return allowed.has(storeId);
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
