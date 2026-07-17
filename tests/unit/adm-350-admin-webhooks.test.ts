import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminProviderCallbackDtoSchema,
  adminProviderCallbackListEnvelopeSchema,
  adminSellerWebhookDeliveryDtoSchema,
  adminSellerWebhookDeliveryListEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  getAdminProviderCallback,
  getAdminSellerWebhookDelivery,
  listAdminProviderCallbacks,
  listAdminSellerWebhookDeliveries,
  listAdminWebhookConsole,
  replayAdminProviderCallback,
  retryAdminSellerWebhookDelivery,
} from "@/features/admin/operations/webhooks/api";
import {
  mapProviderCallbackDto,
  mapSellerWebhookDeliveryDto,
  mergeWebhookRows,
  webhookRowKey,
  webhookRowKeyFromParts,
} from "@/features/admin/operations/webhooks/mappers";
import {
  hasVerifiedForceFulfillEvidence,
  isFailedSellerDelivery,
  isFailedXenditCallback,
  type ProviderCallbackRow,
  type SellerWebhookDeliveryRow,
} from "@/features/admin/operations/webhooks/data";
import { queryKeys } from "@/shared/query/query-keys";

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

function installApiAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const meta = {
  requestId: "req_adm350",
  timestamp: "2026-07-17T12:00:00Z",
};

const sampleCallback = {
  callbackId: "pcb_01HQ",
  provider: "xendit",
  accountScope: "main",
  paymentMode: "LIVE",
  providerEventId: "evt-99281",
  processingState: "FAILED",
  receivedAt: "2026-07-12T07:39:22Z",
  attemptCount: 4,
  replayCount: 0,
  normalizedType: "payment.qris.paid",
  paymentIntentId: "FRS-240712-1902",
  providerReference: "XND-QRP-99281",
  payloadDigest: "sha256:abc123def456",
  failureCode: "Timeout",
};

const sampleDelivery = {
  deliveryId: "whd_9227",
  kind: "SELLER_DELIVERY",
  endpointId: "whe_1",
  endpointHost: "merchant.example",
  merchantId: "mrc_1",
  paymentMode: "LIVE",
  eventId: "evt_del_1",
  eventType: "delivery.fulfilled",
  status: "DEAD_LETTER",
  attemptCount: 3,
  lastHttpStatus: 500,
  isTest: false,
  createdAt: "2026-07-12T07:00:00Z",
  updatedAt: "2026-07-12T07:20:00Z",
  orderId: "FRS-240712-1811",
  payloadHash: "phash_redacted_only",
};

describe("ADM-350 admin provider callbacks + seller deliveries", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("rejects secret/payload body fields on callback DTO", () => {
    const bad = {
      ...sampleCallback,
      encryptedPayload: "SECRET",
    };
    expect(() => adminProviderCallbackDtoSchema.parse(bad)).toThrow();
  });

  it("rejects signature/secret fields on seller delivery DTO", () => {
    const bad = {
      ...sampleDelivery,
      signingSecret: "whsec_xxx",
    };
    expect(() => adminSellerWebhookDeliveryDtoSchema.parse(bad)).toThrow();
  });

  it("accepts redacted callback + delivery list envelopes", () => {
    expect(
      adminProviderCallbackListEnvelopeSchema.parse({
        data: [sampleCallback],
        meta,
      }).data,
    ).toHaveLength(1);
    expect(
      adminSellerWebhookDeliveryListEnvelopeSchema.parse({
        data: [sampleDelivery],
        meta,
      }).data,
    ).toHaveLength(1);
  });

  it("maps provider callback to PROVIDER_CALLBACK row without secrets", () => {
    const row = mapProviderCallbackDto(sampleCallback);
    expect(row.kind).toBe("PROVIDER_CALLBACK");
    expect(row.id).toBe("pcb_01HQ");
    expect(row.source).toBe("Xendit");
    expect(row.http).toBe("Timeout");
    expect(row.rawPayloadRef).toMatch(/^digest:/);
    expect(JSON.stringify(row)).not.toMatch(/encrypted|signingSecret|whsec/i);
  });

  it("maps seller delivery to SELLER_DELIVERY row", () => {
    const row = mapSellerWebhookDeliveryDto(sampleDelivery);
    expect(row.kind).toBe("SELLER_DELIVERY");
    expect(row.id).toBe("whd_9227");
    expect(row.http).toBe("500");
    expect(row.deliveryStatus).toBe("DEAD_LETTER");
    expect(isFailedSellerDelivery(row)).toBe(true);
  });

  it("uses kind+id stable keys to avoid ID collision", () => {
    const cb: ProviderCallbackRow = {
      kind: "PROVIDER_CALLBACK",
      id: "same_id",
      source: "Xendit",
      event: "e",
      order: "o",
      http: "200",
      providerStatus: "PAID",
      providerReference: "r",
      amount: 1,
      receivedAt: "—",
      signatureValidation: "VERIFIED",
      canonicalEventKey: "k",
      rawPayloadRef: "redacted",
      orderStatus: "Fulfilled",
      age: "1m",
      attempts: 1,
    };
    const del: SellerWebhookDeliveryRow = {
      kind: "SELLER_DELIVERY",
      id: "same_id",
      source: "Seller",
      event: "e",
      order: "o",
      http: "200",
      deliveryStatus: "DELIVERED",
      orderStatus: "Fulfilled",
      age: "1m",
      attempts: 1,
    };
    expect(webhookRowKey(cb)).not.toBe(webhookRowKey(del));
    expect(webhookRowKeyFromParts("PROVIDER_CALLBACK", "same_id")).toBe(
      "PROVIDER_CALLBACK:same_id",
    );
    const merged = mergeWebhookRows([cb], [del]);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map(webhookRowKey)).size).toBe(2);
  });

  it("failed callback helpers gate replay eligibility", () => {
    const failed = mapProviderCallbackDto(sampleCallback);
    expect(isFailedXenditCallback(failed)).toBe(true);
    const ok = mapProviderCallbackDto({
      ...sampleCallback,
      processingState: "PROCESSED",
      failureCode: undefined,
    });
    expect(isFailedXenditCallback(ok)).toBe(false);
  });

  it("force-fulfill evidence requires bound verified mismatch", () => {
    const row: ProviderCallbackRow = {
      kind: "PROVIDER_CALLBACK",
      id: "whd_9244",
      source: "Xendit",
      event: "payment.qris.paid",
      order: "FRS-1",
      http: "Timeout",
      providerStatus: "PAID",
      providerReference: "XND-1",
      amount: 1000,
      receivedAt: "—",
      signatureValidation: "VERIFIED",
      canonicalEventKey: "k",
      rawPayloadRef: "redacted",
      orderStatus: "Pending",
      age: "1m",
      attempts: 1,
      fulfillmentEvidence: {
        id: "evd",
        fileName: "e.pdf",
        sha256: "sha256:x",
        verifiedAt: "—",
        providerReference: "XND-1",
        merchantOrderId: "FRS-1",
        amount: 1000,
        status: "VERIFIED",
      },
    };
    expect(hasVerifiedForceFulfillEvidence(row)).toBe(true);
    expect(
      hasVerifiedForceFulfillEvidence({
        ...row,
        fulfillmentEvidence: {
          ...row.fulfillmentEvidence!,
          amount: 999,
        },
      }),
    ).toBe(false);
  });

  it("lists callbacks and deliveries on API path", async () => {
    installApiAdmin();
    apiRequestMock
      .mockResolvedValueOnce({ data: [sampleCallback], meta })
      .mockResolvedValueOnce({ data: [sampleDelivery], meta });

    const callbacks = await listAdminProviderCallbacks();
    expect(callbacks).toHaveLength(1);
    expect(callbacks[0]!.kind).toBe("PROVIDER_CALLBACK");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/provider-callbacks",
    );

    const deliveries = await listAdminSellerWebhookDeliveries({
      status: "DEAD_LETTER",
    });
    expect(deliveries).toHaveLength(1);
    expect(apiRequestMock.mock.calls[1]![0]).toBe(
      "/v1/admin/seller-webhook-deliveries",
    );
    expect(apiRequestMock.mock.calls[1]![1].query).toEqual({
      status: "DEAD_LETTER",
    });
  });

  it("compose reports partial source failure", async () => {
    installApiAdmin();
    apiRequestMock
      .mockResolvedValueOnce({ data: [sampleCallback], meta })
      .mockRejectedValueOnce(new Error("seller deliveries 503"));

    const composed = await listAdminWebhookConsole();
    expect(composed.rows.some((r) => r.kind === "PROVIDER_CALLBACK")).toBe(
      true,
    );
    expect(composed.callbackError).toBeNull();
    expect(composed.deliveryError).toMatch(/503|unavailable/i);
  });

  it("detail GET uses correct namespaces", async () => {
    installApiAdmin();
    apiRequestMock
      .mockResolvedValueOnce({ data: sampleCallback, meta })
      .mockResolvedValueOnce({ data: sampleDelivery, meta });

    const cb = await getAdminProviderCallback("pcb_01HQ");
    expect(cb?.kind).toBe("PROVIDER_CALLBACK");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/provider-callbacks/pcb_01HQ",
    );

    const del = await getAdminSellerWebhookDelivery("whd_9227");
    expect(del?.kind).toBe("SELLER_DELIVERY");
    expect(apiRequestMock.mock.calls[1]![0]).toBe(
      "/v1/admin/seller-webhook-deliveries/whd_9227",
    );
  });

  it("replay callback sends reason + MFA + idempotency", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...sampleCallback, processingState: "ACCEPTED" },
      meta,
    });

    const result = await replayAdminProviderCallback({
      callbackId: "pcb_01HQ",
      reason: "Replay after outbox stall for paid QRIS",
      idempotencyKey: "idem_replay_1",
    });
    expect(result.row.kind).toBe("PROVIDER_CALLBACK");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/provider-callbacks/pcb_01HQ/replay",
    );
    const opts = apiRequestMock.mock.calls[0]![1];
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual({
      reason: "Replay after outbox stall for paid QRIS",
    });
    expect(opts.idempotencyKey).toBe("idem_replay_1");
    expect(opts.auditReason).toBe("Replay after outbox stall for paid QRIS");
    expect(opts.requireRecentMfa).toBe(true);
  });

  it("retry seller delivery never hits provider-callbacks path", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...sampleDelivery, status: "QUEUED" },
      meta,
    });

    const result = await retryAdminSellerWebhookDelivery({
      deliveryId: "whd_9227",
      reason: "Merchant endpoint recovered; requeue dead letter",
      idempotencyKey: "idem_retry_1",
    });
    expect(result.row.kind).toBe("SELLER_DELIVERY");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/seller-webhook-deliveries/whd_9227/retry",
    );
    expect(apiRequestMock.mock.calls[0]![0]).not.toMatch(/provider-callback/);
  });

  it("rejects short reason on replay/retry", async () => {
    installApiAdmin();
    await expect(
      replayAdminProviderCallback({
        callbackId: "pcb_01HQ",
        reason: "short",
      }),
    ).rejects.toThrow(/12/);
    await expect(
      retryAdminSellerWebhookDelivery({
        deliveryId: "whd_9227",
        reason: "short",
      }),
    ).rejects.toThrow(/12/);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("mock path returns snapshot fixtures", async () => {
    installMockAdmin();
    const composed = await listAdminWebhookConsole();
    expect(composed.rows.length).toBeGreaterThan(0);
    expect(composed.rows.some((r) => r.kind === "PROVIDER_CALLBACK")).toBe(
      true,
    );
    expect(composed.rows.some((r) => r.kind === "SELLER_DELIVERY")).toBe(true);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("permission codes for read/replay/retry are known", () => {
    expect(claimsHavePermission(["webhooks.read"], "webhooks.read")).toBe(true);
    expect(
      claimsHavePermission(
        ["provider_callbacks.replay"],
        "provider_callbacks.replay",
      ),
    ).toBe(true);
    expect(
      claimsHavePermission(
        ["seller_webhook_deliveries.retry"],
        "seller_webhook_deliveries.retry",
      ),
    ).toBe(true);
    expect(
      claimsHavePermission(["webhooks.read"], "provider_callbacks.replay"),
    ).toBe(false);
  });

  it("query keys separate namespaces", () => {
    expect(queryKeys.admin.providerCallbacks()).toEqual([
      "admin",
      "provider-callbacks",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.sellerWebhookDelivery("whd_1")).toEqual([
      "admin",
      "seller-webhook-deliveries",
      "whd_1",
    ]);
    expect(queryKeys.admin.webhooks({ compose: "both" })).toEqual([
      "admin",
      "webhooks",
      "bounded",
      { compose: "both" },
    ]);
  });
});
