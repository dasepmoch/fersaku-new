import type {
  ApiCredentialClaimOffer,
  ApiKeyReveal,
  SellerApiCredential,
  SellerKycCase,
  SellerKycStatus,
} from "./contracts";

/** Snapshot-identical demo API key for mock/prototype mode. */
export const MOCK_API_KEY_RAW = "sk_live_mock_not_a_real_secret";
export const MOCK_WEBHOOK_SECRET_RAW = "whsec_mock_not_a_real_secret";

export function demoApiCredentials(
  storeId = "demo_store",
): SellerApiCredential[] {
  return [
    {
      id: "apk_demo_01",
      storeId,
      merchantId: "mrc_demo",
      displayValue: MOCK_API_KEY_RAW,
      keyPrefix: "sk_live_mock",
      fingerprint: "fp_demo_api",
      paymentMode: "LIVE",
      status: "ACTIVE",
      statusLabel: "Aktif",
      keyVersion: 1,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-12T00:00:00Z",
    },
  ];
}

export function demoKycStatus(): SellerKycStatus {
  return {
    status: "APPROVED",
    statusLabel: "disetujui",
    capability: "QRIS_API_LIVE",
    paymentMode: "LIVE",
    liveApiEligible: true,
    requiredDocuments: [],
    approvedAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

export function mockApiCredentialClaimOffer(
  storeId: string,
  paymentMode: "SANDBOX" | "LIVE" = "SANDBOX",
): ApiCredentialClaimOffer {
  const id = `apk_mock_${Date.now()}`;
  return {
    credential: {
      id,
      storeId,
      paymentMode,
      displayValue: "sk_••••••••",
      keyPrefix: paymentMode === "LIVE" ? "sk_live_" : "sk_test_",
      status: "PENDING_CLAIM",
      statusLabel: "Menunggu claim",
      keyVersion: 1,
    },
    issuanceStatus: "AUTHORIZED",
    claimId: `claim_${id}`,
    claimToken: `mock_claim_${id}`,
    claimExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    paymentMode,
  };
}

export function mockApiKeyReveal(keyId: string): ApiKeyReveal {
  return {
    apiKey: MOCK_API_KEY_RAW,
    fingerprint: "fp_mock",
    keyPrefix: "sk_live_mock",
    keyVersion: 1,
    credential: {
      id: keyId,
      displayValue: MOCK_API_KEY_RAW,
      keyPrefix: "sk_live_mock",
      paymentMode: "LIVE",
      status: "ACTIVE",
      statusLabel: "Aktif",
      keyVersion: 1,
    },
  };
}

export function mockKycCase(legalName: string): SellerKycCase {
  return {
    id: `kyc_mock_${Date.now()}`,
    status: "DRAFT",
    statusLabel: "draft",
    legalName,
    documentCount: 0,
    createdAt: new Date().toISOString(),
  };
}
