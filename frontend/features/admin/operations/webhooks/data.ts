type WebhookBaseRow = {
  id: string;
  event: string;
  order: string;
  http: string;
  orderStatus: string;
  age: string;
  attempts: number;
};

export type ProviderCallbackRow = WebhookBaseRow & {
  kind: "PROVIDER_CALLBACK";
  source: "Xendit";
  providerStatus: string;
  providerReference: string;
  amount: number;
  receivedAt: string;
  signatureValidation: "VERIFIED" | "REJECTED";
  canonicalEventKey: string;
  rawPayloadRef: string;
  /** BE processing state when live (ACCEPTED|PROCESSING|PROCESSED|FAILED|QUARANTINED). */
  processingState?: string;
  payloadDigest?: string;
  mismatchCode?: string;
  failureCode?: string;
  paymentIntentId?: string;
  providerEventId?: string;
  fulfillmentEvidence?: {
    id: string;
    fileName: string;
    sha256: string;
    verifiedAt: string;
    providerReference: string;
    merchantOrderId: string;
    amount: number;
    status: "VERIFIED" | "REJECTED";
  };
};

export type SellerWebhookDeliveryRow = WebhookBaseRow & {
  kind: "SELLER_DELIVERY";
  source: "Seller";
  deliveryStatus: string;
  endpointHost?: string;
  endpointId?: string;
  merchantId?: string;
  eventId?: string;
  deadLetterReason?: string;
  payloadHash?: string;
};

export type WebhookRow = ProviderCallbackRow | SellerWebhookDeliveryRow;

/** Only Xendit callback deliveries belong to the operational retry queue. */
export function isFailedXenditCallback(row: WebhookRow): boolean {
  return (
    row.kind === "PROVIDER_CALLBACK" &&
    !["200", "202", "Retrying"].includes(row.http)
  );
}

export function isFailedSellerDelivery(row: WebhookRow): boolean {
  return (
    row.kind === "SELLER_DELIVERY" &&
    !["200", "202", "204", "Retrying"].includes(row.http)
  );
}

export function hasVerifiedForceFulfillEvidence(
  row: WebhookRow,
): row is ProviderCallbackRow & {
  fulfillmentEvidence: NonNullable<ProviderCallbackRow["fulfillmentEvidence"]>;
} {
  if (
    row.kind !== "PROVIDER_CALLBACK" ||
    row.event !== "payment.qris.paid" ||
    row.providerStatus !== "PAID" ||
    row.orderStatus !== "Pending" ||
    row.signatureValidation !== "VERIFIED" ||
    !row.fulfillmentEvidence ||
    row.fulfillmentEvidence.status !== "VERIFIED"
  ) {
    return false;
  }
  return (
    row.fulfillmentEvidence.providerReference === row.providerReference &&
    row.fulfillmentEvidence.merchantOrderId === row.order &&
    row.fulfillmentEvidence.amount === row.amount
  );
}

export const initialWebhooks: WebhookRow[] = [
  {
    kind: "PROVIDER_CALLBACK",
    id: "whd_9244",
    source: "Xendit",
    event: "payment.qris.paid",
    order: "FRS-240712-1902",
    http: "Timeout",
    providerStatus: "PAID",
    providerReference: "XND-QRP-99281",
    amount: 129000,
    receivedAt: "12 Jul 2026, 14:39:22.841",
    signatureValidation: "VERIFIED",
    canonicalEventKey: "xendit:main:qris:evt-99281",
    rawPayloadRef: "r2://callback-evidence/whd_9244.enc",
    fulfillmentEvidence: {
      id: "evd_9244",
      fileName: "provider_XND_99281.pdf",
      sha256: "sha256:6f9f8f7d0f72f2d8",
      verifiedAt: "12 Jul 2026, 14:42:09",
      providerReference: "XND-QRP-99281",
      merchantOrderId: "FRS-240712-1902",
      amount: 129000,
      status: "VERIFIED",
    },
    orderStatus: "Pending",
    age: "3m",
    attempts: 4,
  },
  {
    kind: "PROVIDER_CALLBACK",
    id: "whd_9241",
    source: "Xendit",
    event: "payment.qris.paid",
    order: "FRS-240712-1848",
    http: "200",
    providerStatus: "PAID",
    providerReference: "XND-QRP-99176",
    amount: 89000,
    receivedAt: "12 Jul 2026, 14:35:18.114",
    signatureValidation: "VERIFIED",
    canonicalEventKey: "xendit:main:qris:evt-99176",
    rawPayloadRef: "r2://callback-evidence/whd_9241.enc",
    orderStatus: "Fulfilled",
    age: "7m",
    attempts: 1,
  },
  {
    kind: "PROVIDER_CALLBACK",
    id: "whd_9231",
    source: "Xendit",
    event: "withdrawal.completed",
    order: "WD-120724",
    http: "200",
    providerStatus: "COMPLETED",
    providerReference: "XND-WD-77120",
    amount: 500000,
    receivedAt: "12 Jul 2026, 14:30:02.410",
    signatureValidation: "VERIFIED",
    canonicalEventKey: "xendit:main:payout:evt-77120",
    rawPayloadRef: "r2://callback-evidence/whd_9231.enc",
    orderStatus: "Completed",
    age: "12m",
    attempts: 1,
  },
  {
    kind: "SELLER_DELIVERY",
    id: "whd_9227",
    source: "Seller",
    event: "delivery.fulfilled",
    order: "FRS-240712-1811",
    http: "500",
    deliveryStatus: "FAILED",
    orderStatus: "Fulfilled",
    age: "18m",
    attempts: 3,
  },
  {
    kind: "PROVIDER_CALLBACK",
    id: "whd_9224",
    source: "Xendit",
    event: "payment.qris.paid",
    order: "FRS-240712-1804",
    http: "401",
    providerStatus: "PAID",
    providerReference: "XND-QRP-98992",
    amount: 159000,
    receivedAt: "12 Jul 2026, 14:18:33.093",
    signatureValidation: "VERIFIED",
    canonicalEventKey: "xendit:main:qris:evt-98992",
    rawPayloadRef: "r2://callback-evidence/whd_9224.enc",
    fulfillmentEvidence: {
      id: "evd_9224",
      fileName: "provider_XND_98992.pdf",
      sha256: "sha256:08b325a7c1335e7c",
      verifiedAt: "12 Jul 2026, 14:28:41",
      providerReference: "XND-QRP-98992",
      merchantOrderId: "FRS-240712-1804",
      amount: 159000,
      status: "VERIFIED",
    },
    orderStatus: "Pending",
    age: "24m",
    attempts: 5,
  },
  {
    kind: "PROVIDER_CALLBACK",
    id: "whd_9218",
    source: "Xendit",
    event: "withdrawal.failed",
    order: "WD-120690",
    http: "200",
    providerStatus: "FAILED",
    providerReference: "XND-WD-76990",
    amount: 75000,
    receivedAt: "12 Jul 2026, 14:06:55.301",
    signatureValidation: "VERIFIED",
    canonicalEventKey: "xendit:main:payout:evt-76990",
    rawPayloadRef: "r2://callback-evidence/whd_9218.enc",
    orderStatus: "Pending",
    age: "36m",
    attempts: 2,
  },
  {
    kind: "SELLER_DELIVERY",
    id: "whd_9211",
    source: "Seller",
    event: "delivery.failed",
    order: "FRS-240712-1790",
    http: "500",
    deliveryStatus: "FAILED",
    orderStatus: "Pending",
    age: "48m",
    attempts: 4,
  },
];
