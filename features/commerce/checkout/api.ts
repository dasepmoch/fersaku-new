import { apiRequest } from "@/shared/api/http-client";
import {
  checkoutIntentEnvelopeSchema,
  checkoutPriceEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type {
  CheckoutIntent,
  CheckoutQuote,
  CheckoutQuoteSelection,
  CreateCheckoutIntentInput,
} from "./contracts";
import {
  buildMockCheckoutQuote,
  mapCheckoutIntentDto,
  mapCheckoutPriceDto,
  toCheckoutQuoteRequestBody,
  toCreateCheckoutIntentRequestBody,
} from "./mappers";

export type SimulateCheckoutPaymentInput = {
  productId: string;
  storeSlug: string;
  customer: { name: string; email: string };
  /** Display-only in mock; never server authority. */
  total: number;
  tip: number;
  upsell: boolean;
  idempotencyKey?: string;
};

export type SimulateCheckoutPaymentResult = {
  accepted: boolean;
  status: "paid" | "pending";
  orderId: string;
  requestId: string;
};

/**
 * Server-authoritative checkout quote (CHK-100).
 * Request carries identifiers/selections only — never client total as authority.
 * Optional clientDiscount is stripped from authority; BE sets clientDiscountIgnored.
 */
export async function requestCheckoutQuote(
  selection: CheckoutQuoteSelection,
  options?: {
    signal?: AbortSignal;
    /** Catalog list price for mock fixture math only. */
    catalogPrice?: number;
    /** Test-only: prove client discount is ignored. */
    clientDiscount?: number;
  },
): Promise<CheckoutQuote> {
  if (shouldUseMockFixtures("checkout")) {
    const catalogPrice = options?.catalogPrice ?? selection.merchandise ?? 0;
    const quote = buildMockCheckoutQuote(selection, catalogPrice);
    // Mirror BE: always report client discount ignored when present.
    if (options?.clientDiscount !== undefined) {
      return { ...quote, clientDiscountIgnored: true };
    }
    return quote;
  }

  const body = toCheckoutQuoteRequestBody(selection, {
    clientDiscount: options?.clientDiscount,
  });

  const response = await apiRequest<
    { data: Parameters<typeof mapCheckoutPriceDto>[0] },
    typeof body
  >(
    "/v1/checkout/quote",
    {
      schema: checkoutPriceEnvelopeSchema,
      method: "POST",
      body,
      signal: options?.signal,
    },
  );
  return mapCheckoutPriceDto(response.data);
}

/**
 * Create hosted checkout payment intent (CHK-110).
 * Live/api only — mock callers must use simulateCheckoutPayment.
 * Idempotency-Key is required; same key for retry/timeout recovery.
 */
export async function createCheckoutIntent(
  input: CreateCheckoutIntentInput,
  signal?: AbortSignal,
): Promise<CheckoutIntent> {
  if (shouldUseMockFixtures("checkout")) {
    throw new Error(
      "createCheckoutIntent is api-only; use simulateCheckoutPayment in mock",
    );
  }

  const body = toCreateCheckoutIntentRequestBody(input);
  const response = await apiRequest<
    { data: Parameters<typeof mapCheckoutIntentDto>[0] },
    typeof body
  >("/v1/checkout/intents", {
    schema: checkoutIntentEnvelopeSchema,
    method: "POST",
    body,
    signal,
    idempotencyKey: input.idempotencyKey,
  });
  return mapCheckoutIntentDto(response.data);
}

/**
 * Authoritative intent status poll (CHK-120).
 * Safe GET only — never creates intents; never marks paid from client timer.
 * Live/api only.
 */
export async function getCheckoutIntent(
  intentId: string,
  signal?: AbortSignal,
): Promise<CheckoutIntent> {
  if (shouldUseMockFixtures("checkout")) {
    throw new Error(
      "getCheckoutIntent is api-only; mock checkout does not poll intents",
    );
  }
  const id = intentId.trim();
  if (!id) {
    throw new Error("getCheckoutIntent requires intentId");
  }

  const response = await apiRequest<{
    data: Parameters<typeof mapCheckoutIntentDto>[0];
  }>(`/v1/checkout/intents/${encodeURIComponent(id)}`, {
    schema: checkoutIntentEnvelopeSchema,
    method: "GET",
    signal,
  });
  return mapCheckoutIntentDto(response.data);
}

/**
 * Mock/local simulate payment only (CHK-110).
 * Never calls live simulate-payment or create-intent.
 * Live path must use createCheckoutIntent.
 */
export async function simulateCheckoutPayment(
  input: SimulateCheckoutPaymentInput,
  signal?: AbortSignal,
): Promise<SimulateCheckoutPaymentResult> {
  void signal;
  if (!shouldUseMockFixtures("checkout")) {
    throw new Error(
      "simulateCheckoutPayment is mock-only; use createCheckoutIntent for api checkout",
    );
  }

  return {
    accepted: true,
    status: "paid",
    orderId: "FRS-240712-1848",
    requestId: `mock_checkout_${input.productId}`,
  };
}

/** True when checkout domain is wired to live API (not mock/disabled). */
export function isCheckoutApiDomain(): boolean {
  return getDomainSource("checkout") === "api";
}
