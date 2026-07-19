import type {
  SellerWebhookDelivery,
  SellerWebhookEndpoint,
  WebhookSecretClaimOffer,
  WebhookSigningSecretReveal,
} from "./contracts";

/** Snapshot-identical demo endpoint for mock/prototype mode. */
export function demoWebhookEndpoints(
  storeId = "demo_store",
): SellerWebhookEndpoint[] {
  return [
    {
      id: "whep_demo_01",
      storeId,
      merchantId: "mrc_demo",
      paymentMode: "LIVE",
      url: "https://asep.ai/api/webhooks/fersaku",
      urlHost: "asep.ai",
      status: "ACTIVE",
      statusLabel: "Active",
      configVersion: 1,
      eventAllowlist: [
        "order.paid",
        "delivery.fulfilled",
        "payment.qris.created",
        "payment.failed",
        "withdrawal.completed",
      ],
      currentSecretVersion: 1,
      failureCount: 0,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-12T00:00:00Z",
    },
    {
      id: "whep_demo_02",
      storeId,
      merchantId: "mrc_demo",
      paymentMode: "SANDBOX",
      url: "https://staging.asep.ai/hooks",
      urlHost: "staging.asep.ai",
      status: "ACTIVE",
      statusLabel: "Active",
      configVersion: 1,
      eventAllowlist: ["webhook.test", "payment.paid"],
      currentSecretVersion: 1,
      failureCount: 0,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-10T00:00:00Z",
    },
  ];
}

/** Snapshot delivery rows matching existing WebhookLab table. */
export function demoWebhookDeliveries(
  storeId = "demo_store",
): SellerWebhookDelivery[] {
  const ep = demoWebhookEndpoints(storeId)[0]!;
  return [
    {
      deliveryId: "whd_demo_01",
      endpointId: ep.id,
      eventType: "order.paid",
      eventId: "evt_demo_order_paid",
      status: "DELIVERED",
      isTest: false,
      attemptCount: 1,
      lastHttpStatus: 200,
      lastLatencyMs: 84,
      responseLabel: "200 OK",
      latencyLabel: "84 ms",
      createdAt: "2026-07-12T10:00:00Z",
    },
    {
      deliveryId: "whd_demo_02",
      endpointId: ep.id,
      eventType: "delivery.fulfilled",
      eventId: "evt_demo_delivery",
      status: "DELIVERED",
      isTest: false,
      attemptCount: 1,
      lastHttpStatus: 200,
      lastLatencyMs: 112,
      responseLabel: "200 OK",
      latencyLabel: "112 ms",
      createdAt: "2026-07-12T09:00:00Z",
    },
    {
      deliveryId: "whd_demo_03",
      endpointId: ep.id,
      eventType: "payment.qris.created",
      eventId: "evt_demo_qris",
      status: "DEAD_LETTER",
      isTest: false,
      attemptCount: 3,
      lastHttpStatus: 500,
      lastLatencyMs: 1800,
      responseLabel: "500 Error",
      latencyLabel: "1.8 s",
      createdAt: "2026-07-11T18:00:00Z",
    },
  ];
}

/** Mock create → claim offer (token only; never cache). */
export function mockWebhookClaimOffer(
  storeId: string,
  url: string,
  paymentMode: "SANDBOX" | "LIVE",
): WebhookSecretClaimOffer {
  const id = `whep_mock_${Date.now()}`;
  let host = "hooks.example";
  try {
    host = new URL(url).host;
  } catch {
    /* keep default */
  }
  return {
    endpoint: {
      id,
      storeId,
      paymentMode,
      url,
      urlHost: host,
      status: "PENDING_SECRET_CLAIM",
      statusLabel: "Pending claim",
      configVersion: 1,
      eventAllowlist: ["payment.paid", "webhook.test"],
      currentSecretVersion: 1,
      failureCount: 0,
    },
    claimToken: `mock_claim_${id}`,
    claimExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    secretVersion: 1,
  };
}

/** Mock one-time secret reveal (component memory only). */
export function mockWebhookSecretReveal(
  endpointId: string,
): WebhookSigningSecretReveal {
  return {
    signingSecret: "whsec_mock_not_a_real_secret",
    fingerprint: "fp_mock",
    secretVersion: 1,
    endpoint: {
      id: endpointId,
      paymentMode: "SANDBOX",
      url: "https://hooks.example/fsk",
      urlHost: "hooks.example",
      status: "ACTIVE",
      statusLabel: "Active",
      configVersion: 1,
      eventAllowlist: ["payment.paid", "webhook.test"],
      currentSecretVersion: 1,
      failureCount: 0,
    },
  };
}
