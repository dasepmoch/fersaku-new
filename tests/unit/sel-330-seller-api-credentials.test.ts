import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sellerApiCredentialClaimOfferEnvelopeSchema,
  sellerApiCredentialDtoSchema,
  sellerApiCredentialListEnvelopeSchema,
  sellerApiCredentialRequestSchema,
  sellerApiCredentialSecretClaimEnvelopeSchema,
  sellerKycCreateCaseRequestSchema,
  sellerKycStatusEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/http-client";
import {
  mapApiCredentialDto,
  mapClaimOfferDto,
  mapCredentialStatusLabel,
  mapKycStatusDto,
  mapKycStatusLabel,
  mapSecretClaimDto,
  pickPrimaryCredential,
  toRequestCredentialBody,
} from "@/features/seller/api-credentials/mappers";
import { DEMO_STORE_ID } from "@/shared/config/demo";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/api/http-client")
  >("@/shared/api/http-client");
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

const meta = {
  requestId: "req_sel330",
  timestamp: "2026-07-17T10:00:00Z",
};

const activeCredential = {
  id: "apk_live_01",
  storeId: "store_live",
  merchantId: "mrc_live",
  keyPrefix: "sk_live_abc1",
  fingerprint: "fp_live_01",
  paymentMode: "LIVE" as const,
  status: "ACTIVE",
  keyVersion: 1,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-17T00:00:00Z",
};

const pendingCredential = {
  ...activeCredential,
  id: "apk_sandbox_02",
  paymentMode: "SANDBOX" as const,
  keyPrefix: "sk_test_xyz",
  status: "PENDING_CLAIM",
};

const kycApproved = {
  status: "APPROVED",
  capability: "QRIS_API_LIVE",
  paymentMode: "LIVE",
  liveApiEligible: true,
  requiredDocuments: [] as string[],
  approvedAt: "2026-07-01T00:00:00Z",
};

function installApiSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

describe("SEL-330 schemas", () => {
  it("accepts credential list without raw apiKey fields", () => {
    expect(
      sellerApiCredentialDtoSchema.safeParse(activeCredential).success,
    ).toBe(true);
    const env = sellerApiCredentialListEnvelopeSchema.safeParse({
      data: { credentials: [activeCredential, pendingCredential] },
      meta,
    });
    expect(env.success).toBe(true);
    if (env.success) {
      const json = JSON.stringify(env.data);
      expect(json).not.toMatch(/apiKey|sk_live_mock|claimToken/);
      expect(env.data.data.credentials[0]).not.toHaveProperty("apiKey");
    }
  });

  it("request requires optional paymentMode/purpose/mfa without inventing secret fields", () => {
    expect(
      sellerApiCredentialRequestSchema.safeParse({
        paymentMode: "SANDBOX",
        purpose: "INITIAL_ISSUE",
        mfaCode: "123456",
      }).success,
    ).toBe(true);
    expect(sellerApiCredentialRequestSchema.safeParse({}).success).toBe(true);
  });

  it("claim offer has claimToken once; secret claim has apiKey once", () => {
    const offer = sellerApiCredentialClaimOfferEnvelopeSchema.safeParse({
      data: {
        credential: pendingCredential,
        claimToken: "tok_once",
        claimId: "claim_1",
        claimExpiresAt: "2026-07-17T11:00:00Z",
        status: "AUTHORIZED",
      },
      meta,
    });
    expect(offer.success).toBe(true);

    const claim = sellerApiCredentialSecretClaimEnvelopeSchema.safeParse({
      data: {
        apiKey: "sk_live_once_only_never_list",
        fingerprint: "fp1",
        keyPrefix: "sk_live_",
        keyVersion: 1,
        credential: activeCredential,
      },
      meta,
    });
    expect(claim.success).toBe(true);
  });

  it("list schema strips raw apiKey even if present on wire", () => {
    const bad = sellerApiCredentialListEnvelopeSchema.safeParse({
      data: {
        credentials: [
          {
            ...activeCredential,
            apiKey: "sk_live_should_not_parse_into_list",
          },
        ],
      },
      meta,
    });
    expect(bad.success).toBe(true);
    if (bad.success) {
      expect(bad.data.data.credentials[0]).not.toHaveProperty("apiKey");
    }
  });

  it("KYC status envelope accepts capability fields only", () => {
    const env = sellerKycStatusEnvelopeSchema.safeParse({
      data: kycApproved,
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("KYC create case requires legalName", () => {
    expect(
      sellerKycCreateCaseRequestSchema.safeParse({
        legalName: "PT Demo",
      }).success,
    ).toBe(true);
    expect(sellerKycCreateCaseRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("SEL-330 mappers", () => {
  it("maps credential status labels", () => {
    expect(mapCredentialStatusLabel("ACTIVE")).toBe("Aktif");
    expect(mapCredentialStatusLabel("PENDING_CLAIM")).toBe("Menunggu claim");
    expect(mapCredentialStatusLabel("REVOKED")).toBe("Dicabut");
  });

  it("maps credential DTO to masked display without carrying raw key", () => {
    const view = mapApiCredentialDto(activeCredential);
    expect(view.displayValue).toContain("sk_live_abc1");
    expect(view.displayValue).toContain("••••");
    expect(view.statusLabel).toBe("Aktif");
    expect(view).not.toHaveProperty("apiKey");
    expect(view).not.toHaveProperty("claimToken");
  });

  it("claim offer maps token; secret reveal maps once", () => {
    const offer = mapClaimOfferDto({
      credential: pendingCredential,
      claimToken: "tok_abc",
      claimId: "claim_x",
      status: "AUTHORIZED",
    });
    expect(offer.claimToken).toBe("tok_abc");
    expect(offer.credential?.status).toBe("PENDING_CLAIM");

    const reveal = mapSecretClaimDto({
      apiKey: "sk_live_once_only",
      fingerprint: "fp",
      keyVersion: 2,
      credential: activeCredential,
    });
    expect(reveal.apiKey).toBe("sk_live_once_only");
    expect(reveal.credential?.statusLabel).toBe("Aktif");
  });

  it("KYC status maps approved label for existing UI phrase", () => {
    expect(mapKycStatusLabel("APPROVED")).toBe("disetujui");
    const view = mapKycStatusDto(kycApproved);
    expect(view.statusLabel).toBe("disetujui");
    expect(view.liveApiEligible).toBe(true);
  });

  it("request body passes MFA/purpose without inventing fields", () => {
    const body = toRequestCredentialBody({
      paymentMode: "LIVE",
      purpose: "ROTATE",
      mfaCode: "654321",
      reason: "lost key",
    });
    expect(body.paymentMode).toBe("LIVE");
    expect(body.mfaCode).toBe("654321");
    expect(body).not.toHaveProperty("apiKey");
  });

  it("pickPrimaryCredential prefers ACTIVE LIVE", () => {
    const list = [
      mapApiCredentialDto(pendingCredential),
      mapApiCredentialDto(activeCredential),
    ];
    expect(pickPrimaryCredential(list)?.id).toBe("apk_live_01");
  });
});

describe("SEL-330 query keys", () => {
  it("includes store id; never secret material", () => {
    expect(queryKeys.seller.apiKeys("store_a")).toEqual([
      "seller",
      "store_a",
      "api-keys",
    ]);
    expect(queryKeys.seller.apiKeys("store_a")).not.toEqual(
      queryKeys.seller.apiKeys("store_b"),
    );
    expect(queryKeys.seller.kyc("user:sess")).toEqual([
      "seller",
      "user:sess",
      "kyc",
    ]);
    const keyJson = JSON.stringify([
      queryKeys.seller.apiKeys("store_a"),
      queryKeys.seller.kyc("user:sess"),
    ]);
    expect(keyJson).not.toMatch(/secret|claim|apiKey|sk_live|mfa/i);
  });
});

describe("SEL-330 api adapters", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("mock path returns fixtures without network", async () => {
    installMockSeller();
    const {
      listSellerApiCredentials,
      requestSellerApiCredential,
      claimSellerApiCredential,
      getSellerKycStatus,
      revokeSellerApiCredential,
    } = await import("@/features/seller/api-credentials/api");

    const list = await listSellerApiCredentials(DEMO_STORE_ID);
    const offer = await requestSellerApiCredential(DEMO_STORE_ID, {
      paymentMode: "SANDBOX",
      purpose: "INITIAL_ISSUE",
    });
    const reveal = await claimSellerApiCredential(
      DEMO_STORE_ID,
      offer.claimToken!,
      { claimId: offer.claimId },
    );
    const kyc = await getSellerKycStatus();
    const revoked = await revokeSellerApiCredential(
      DEMO_STORE_ID,
      list[0]!.id,
    );

    expect(list.length).toBeGreaterThan(0);
    expect(list[0]?.displayValue).toMatch(/sk_|mock/);
    expect(offer.claimToken).toMatch(/^mock_claim_/);
    expect(reveal.apiKey).toMatch(/^sk_live_mock_/);
    expect(kyc.statusLabel).toBe("disetujui");
    expect(revoked.status).toBe("REVOKED");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list uses store-scoped path and maps masked credentials", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { credentials: [activeCredential, pendingCredential] },
      meta,
    });
    const { listSellerApiCredentials } = await import(
      "@/features/seller/api-credentials/api"
    );
    const list = await listSellerApiCredentials("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/api-credentials",
      expect.objectContaining({
        schema: sellerApiCredentialListEnvelopeSchema,
      }),
    );
    expect(list).toHaveLength(2);
    expect(list[0]?.statusLabel).toBe("Aktif");
    expect(list[1]?.statusLabel).toBe("Menunggu claim");
    expect(JSON.stringify(list)).not.toMatch(
      /"apiKey"|sk_live_once|claimToken/,
    );
  });

  it("api request returns claim offer only (no raw key in list path)", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        credential: pendingCredential,
        claimToken: "claim_tok_once",
        claimId: "claim_99",
        claimExpiresAt: "2026-07-17T11:00:00Z",
        status: "AUTHORIZED",
      },
      meta,
    });
    const { requestSellerApiCredential } = await import(
      "@/features/seller/api-credentials/api"
    );
    const offer = await requestSellerApiCredential("store_live", {
      paymentMode: "SANDBOX",
      purpose: "INITIAL_ISSUE",
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/api-credential-requests",
      expect.objectContaining({
        method: "POST",
        schema: sellerApiCredentialClaimOfferEnvelopeSchema,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(offer.claimToken).toBe("claim_tok_once");
    expect(offer).not.toHaveProperty("apiKey");
  });

  it("one-time claim exchange uses body token only; raw key not in list schema", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        apiKey: "sk_live_once_only",
        fingerprint: "fp_live",
        keyPrefix: "sk_live_",
        keyVersion: 1,
        credential: activeCredential,
      },
      meta,
    });
    const { claimSellerApiCredential } = await import(
      "@/features/seller/api-credentials/api"
    );
    const reveal = await claimSellerApiCredential(
      "store_live",
      "claim_tok_once",
      { claimId: "claim_99", mfaCode: "111111" },
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/api-credential-claims/claim_99/exchange",
      expect.objectContaining({
        method: "POST",
        body: { token: "claim_tok_once", mfaCode: "111111" },
        schema: sellerApiCredentialSecretClaimEnvelopeSchema,
      }),
    );
    expect(reveal.apiKey).toBe("sk_live_once_only");
  });

  it("revoke is server-authoritative with idempotency", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...activeCredential, status: "REVOKED" },
      meta,
    });
    const { revokeSellerApiCredential } = await import(
      "@/features/seller/api-credentials/api"
    );
    const result = await revokeSellerApiCredential(
      "store_live",
      "apk_live_01",
      { reason: "compromise" },
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/api-credentials/apk_live_01/revoke",
      expect.objectContaining({
        method: "POST",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(result.status).toBe("REVOKED");
    expect(result.statusLabel).toBe("Dicabut");
  });

  it("foreign store list rethrows resource_not_found (safe 404)", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      }),
    );
    const { listSellerApiCredentials } = await import(
      "@/features/seller/api-credentials/api"
    );
    await expect(
      listSellerApiCredentials("store_foreign"),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("KYC status uses /v1/me/kyc canonical path", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: kycApproved,
      meta,
    });
    const { getSellerKycStatus } = await import(
      "@/features/seller/api-credentials/api"
    );
    const kyc = await getSellerKycStatus();
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/me/kyc",
      expect.objectContaining({
        schema: sellerKycStatusEnvelopeSchema,
      }),
    );
    expect(kyc.statusLabel).toBe("disetujui");
    expect(kyc.liveApiEligible).toBe(true);
  });
});
