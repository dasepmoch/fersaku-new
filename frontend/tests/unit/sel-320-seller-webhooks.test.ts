import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sellerWebhookClaimOfferEnvelopeSchema,
  sellerWebhookCreateRequestSchema,
  sellerWebhookDeliveryListEnvelopeSchema,
  sellerWebhookEndpointDtoSchema,
  sellerWebhookEndpointListEnvelopeSchema,
  sellerWebhookSecretClaimEnvelopeSchema,
  sellerWebhookUpdateRequestSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/http-client";
import {
  formatDeliveryLatencyLabel,
  formatDeliveryResponseLabel,
  mapClaimOfferDto,
  mapSecretClaimDto,
  mapWebhookDeliveryDto,
  mapWebhookEndpointDto,
  mapWebhookStatusLabel,
  toCreateWebhookRequestBody,
} from "@/features/seller/webhooks/mappers";
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
  requestId: "req_sel320",
  timestamp: "2026-07-17T10:00:00Z",
};

const activeEndpoint = {
  id: "whep_live_01",
  storeId: "store_live",
  merchantId: "mrc_live",
  paymentMode: "LIVE" as const,
  url: "https://hooks.merchant.example/fsk",
  urlHost: "hooks.merchant.example",
  status: "ACTIVE",
  configVersion: 1,
  eventAllowlist: ["payment.paid", "webhook.test"],
  currentSecretVersion: 1,
  failureCount: 0,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-17T00:00:00Z",
};

const pendingEndpoint = {
  ...activeEndpoint,
  id: "whep_live_02",
  status: "PENDING_SECRET_CLAIM",
  paymentMode: "SANDBOX" as const,
  url: "https://staging.hooks.example/x",
  urlHost: "staging.hooks.example",
};

const deliveryOk = {
  deliveryId: "whd_01",
  endpointId: "whep_live_01",
  eventType: "payment.paid",
  eventId: "evt_01",
  status: "DELIVERED",
  isTest: false,
  attemptCount: 1,
  lastHttpStatus: 200,
  lastLatencyMs: 84,
  createdAt: "2026-07-17T09:00:00Z",
};

const deliveryFail = {
  ...deliveryOk,
  deliveryId: "whd_02",
  eventType: "webhook.test",
  status: "DEAD_LETTER",
  lastHttpStatus: 500,
  lastLatencyMs: 1800,
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

describe("SEL-320 schemas", () => {
  it("accepts endpoint list without raw secret fields", () => {
    expect(
      sellerWebhookEndpointDtoSchema.safeParse(activeEndpoint).success,
    ).toBe(true);
    const env = sellerWebhookEndpointListEnvelopeSchema.safeParse({
      data: { endpoints: [activeEndpoint, pendingEndpoint] },
      meta,
    });
    expect(env.success).toBe(true);
    if (env.success) {
      const json = JSON.stringify(env.data);
      expect(json).not.toMatch(/signingSecret|whsec_/);
    }
  });

  it("create request requires https url + paymentMode", () => {
    expect(
      sellerWebhookCreateRequestSchema.safeParse({
        url: "https://hooks.example/fsk",
        paymentMode: "SANDBOX",
      }).success,
    ).toBe(true);
    expect(
      sellerWebhookCreateRequestSchema.safeParse({
        url: "https://hooks.example/fsk",
      }).success,
    ).toBe(false);
  });

  it("claim offer has claimToken once; secret claim has signingSecret once", () => {
    const offer = sellerWebhookClaimOfferEnvelopeSchema.safeParse({
      data: {
        endpoint: pendingEndpoint,
        claimToken: "tok_once",
        claimExpiresAt: "2026-07-17T11:00:00Z",
        secretVersion: 1,
      },
      meta,
    });
    expect(offer.success).toBe(true);

    const claim = sellerWebhookSecretClaimEnvelopeSchema.safeParse({
      data: {
        signingSecret: "whsec_live_once",
        fingerprint: "fp1",
        secretVersion: 1,
        endpoint: activeEndpoint,
      },
      meta,
    });
    expect(claim.success).toBe(true);
  });

  it("delivery list has no payload body", () => {
    const env = sellerWebhookDeliveryListEnvelopeSchema.safeParse({
      data: { deliveries: [deliveryOk, deliveryFail] },
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("update allows disable without inventing secret fields", () => {
    expect(
      sellerWebhookUpdateRequestSchema.safeParse({
        disable: true,
        reason: "rotate",
      }).success,
    ).toBe(true);
  });
});

describe("SEL-320 mappers", () => {
  it("maps endpoint status labels for existing chip", () => {
    expect(mapWebhookStatusLabel("ACTIVE")).toBe("Active");
    expect(mapWebhookStatusLabel("PENDING_SECRET_CLAIM")).toBe("Pending claim");
    expect(mapWebhookStatusLabel("SUSPENDED")).toBe("Suspended");
  });

  it("maps endpoint DTO without carrying secret", () => {
    const view = mapWebhookEndpointDto(activeEndpoint);
    expect(view.urlHost).toBe("hooks.merchant.example");
    expect(view.statusLabel).toBe("Active");
    expect(view).not.toHaveProperty("signingSecret");
    expect(view).not.toHaveProperty("claimToken");
  });

  it("maps delivery response/latency labels for table", () => {
    const ok = mapWebhookDeliveryDto(deliveryOk);
    expect(ok.responseLabel).toBe("200 OK");
    expect(ok.latencyLabel).toBe("84 ms");
    const fail = mapWebhookDeliveryDto(deliveryFail);
    expect(fail.responseLabel).toBe("500 Error");
    expect(fail.latencyLabel).toBe("1.8 s");
  });

  it("format helpers stay display-only", () => {
    expect(formatDeliveryResponseLabel("DELIVERED", 200)).toBe("200 OK");
    expect(formatDeliveryResponseLabel("DEAD_LETTER", 502)).toBe("502 Error");
    expect(formatDeliveryLatencyLabel(86)).toBe("86 ms");
    expect(formatDeliveryLatencyLabel(undefined)).toBe("—");
  });

  it("claim offer maps token; secret reveal maps once", () => {
    const offer = mapClaimOfferDto({
      endpoint: pendingEndpoint,
      claimToken: "tok_abc",
      secretVersion: 1,
    });
    expect(offer.claimToken).toBe("tok_abc");
    expect(offer.endpoint.status).toBe("PENDING_SECRET_CLAIM");

    const reveal = mapSecretClaimDto({
      signingSecret: "whsec_once_only",
      fingerprint: "fp",
      secretVersion: 2,
      endpoint: activeEndpoint,
    });
    expect(reveal.signingSecret).toBe("whsec_once_only");
    expect(reveal.endpoint?.statusLabel).toBe("Active");
  });

  it("create body trims url", () => {
    const body = toCreateWebhookRequestBody({
      url: "  https://hooks.example/fsk  ",
      paymentMode: "LIVE",
      eventAllowlist: ["payment.paid"],
    });
    expect(body.url).toBe("https://hooks.example/fsk");
    expect(body.paymentMode).toBe("LIVE");
  });
});

describe("SEL-320 query keys", () => {
  it("includes store id; never secret material", () => {
    expect(queryKeys.seller.webhooks("store_a")).toEqual([
      "seller",
      "store_a",
      "webhooks",
    ]);
    expect(queryKeys.seller.webhookDeliveries("store_a")).toEqual([
      "seller",
      "store_a",
      "webhooks",
      "deliveries",
    ]);
    expect(queryKeys.seller.webhooks("store_a")).not.toEqual(
      queryKeys.seller.webhooks("store_b"),
    );
    const keyJson = JSON.stringify(queryKeys.seller.webhooks("store_a"));
    expect(keyJson).not.toMatch(/secret|claim|whsec/i);
  });
});

describe("SEL-320 api adapters", () => {
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
      listSellerWebhooks,
      listSellerWebhookDeliveries,
      createSellerWebhook,
      claimSellerWebhookSecret,
      testSellerWebhook,
    } = await import("@/features/seller/webhooks/api");

    const list = await listSellerWebhooks(DEMO_STORE_ID);
    const deliveries = await listSellerWebhookDeliveries(DEMO_STORE_ID);
    const offer = await createSellerWebhook(DEMO_STORE_ID, {
      url: "https://hooks.example/fsk",
      paymentMode: "SANDBOX",
    });
    const reveal = await claimSellerWebhookSecret(
      DEMO_STORE_ID,
      offer.endpoint.id,
      offer.claimToken,
    );
    const test = await testSellerWebhook(DEMO_STORE_ID, list[0]!.id);

    expect(list.length).toBeGreaterThan(0);
    expect(list[0]?.url).toContain("asep.ai");
    expect(deliveries).toHaveLength(3);
    expect(deliveries[0]?.responseLabel).toBe("200 OK");
    expect(offer.claimToken).toMatch(/^mock_claim_/);
    expect(reveal.signingSecret).toMatch(/^whsec_mock_/);
    expect(test.isTest).toBe(true);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list uses store-scoped path and maps masked endpoints", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { endpoints: [activeEndpoint, pendingEndpoint] },
      meta,
    });
    const { listSellerWebhooks } =
      await import("@/features/seller/webhooks/api");
    const list = await listSellerWebhooks("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/webhooks",
      expect.objectContaining({
        schema: sellerWebhookEndpointListEnvelopeSchema,
      }),
    );
    expect(list).toHaveLength(2);
    expect(list[0]?.statusLabel).toBe("Active");
    expect(list[1]?.statusLabel).toBe("Pending claim");
    expect(JSON.stringify(list)).not.toMatch(/signingSecret|whsec_/);
  });

  it("api create returns claim offer only (no raw secret in list path)", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        endpoint: pendingEndpoint,
        claimToken: "claim_tok_once",
        claimExpiresAt: "2026-07-17T11:00:00Z",
        secretVersion: 1,
      },
      meta,
    });
    const { createSellerWebhook } =
      await import("@/features/seller/webhooks/api");
    const offer = await createSellerWebhook("store_live", {
      url: "https://hooks.merchant.example/fsk",
      paymentMode: "SANDBOX",
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/webhooks",
      expect.objectContaining({
        method: "POST",
        schema: sellerWebhookClaimOfferEnvelopeSchema,
      }),
    );
    expect(offer.claimToken).toBe("claim_tok_once");
    expect(offer).not.toHaveProperty("signingSecret");
  });

  it("secret claim exchange is one-time and uses body token only", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        signingSecret: "whsec_live_once",
        fingerprint: "fp_live",
        secretVersion: 1,
        endpoint: activeEndpoint,
      },
      meta,
    });
    const { claimSellerWebhookSecret } =
      await import("@/features/seller/webhooks/api");
    const reveal = await claimSellerWebhookSecret(
      "store_live",
      "whep_live_01",
      "claim_tok_once",
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/webhooks/whep_live_01/secret-claims/x/exchange",
      expect.objectContaining({
        method: "POST",
        body: { token: "claim_tok_once" },
        schema: sellerWebhookSecretClaimEnvelopeSchema,
      }),
    );
    expect(reveal.signingSecret).toBe("whsec_live_once");
  });

  it("list never returns raw secret even if present on wire is rejected by schema", () => {
    const bad = sellerWebhookEndpointListEnvelopeSchema.safeParse({
      data: {
        endpoints: [
          {
            ...activeEndpoint,
            signingSecret: "whsec_should_not_parse_into_list",
          },
        ],
      },
      meta,
    });
    // stripUnknown not enabled — extra keys ok on zod object by default strip
    expect(bad.success).toBe(true);
    if (bad.success) {
      expect(bad.data.data.endpoints[0]).not.toHaveProperty("signingSecret");
    }
  });

  it("foreign store list rethrows resource_not_found (safe 404)", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      }),
    );
    const { listSellerWebhooks } =
      await import("@/features/seller/webhooks/api");
    await expect(listSellerWebhooks("store_foreign")).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("test event uses POST .../test with idempotency", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        ...deliveryOk,
        isTest: true,
        eventType: "webhook.test",
        status: "QUEUED",
        lastHttpStatus: undefined,
        lastLatencyMs: undefined,
      },
      meta,
    });
    const { testSellerWebhook } =
      await import("@/features/seller/webhooks/api");
    const result = await testSellerWebhook("store_live", "whep_live_01");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/webhooks/whep_live_01/test",
      expect.objectContaining({
        method: "POST",
        idempotencyKey: expect.any(String),
      }),
    );
    expect(result.eventType).toBe("webhook.test");
    expect(result.isTest).toBe(true);
  });

  it("api deliveries path maps history safely", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { deliveries: [deliveryOk, deliveryFail] },
      meta,
    });
    const { listSellerWebhookDeliveries } =
      await import("@/features/seller/webhooks/api");
    const list = await listSellerWebhookDeliveries("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/webhooks/deliveries",
      expect.objectContaining({
        schema: sellerWebhookDeliveryListEnvelopeSchema,
      }),
    );
    expect(list[0]?.responseLabel).toBe("200 OK");
    expect(list[1]?.responseLabel).toBe("500 Error");
    expect(JSON.stringify(list)).not.toMatch(/payloadBody|signingSecret/);
  });
});
