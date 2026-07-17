import { apiRequest } from "@/shared/api/http-client";
import {
  checkoutPriceEnvelopeSchema,
  structuralEnvelopeSchema,
} from "@/shared/api/schemas";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import type { CheckoutQuote, CheckoutQuoteSelection } from "./contracts";
import {
  buildMockCheckoutQuote,
  mapCheckoutPriceDto,
  toCheckoutQuoteRequestBody,
} from "./mappers";

export type SimulateCheckoutPaymentInput = {
  productId: string;
  storeSlug: string;
  customer: { name: string; email: string };
  /** Display-only in mock; live path must not treat as authority (CHK-110). */
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

  const response = await apiRequest(
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
 * Mock/local simulate payment only. Live intent create is CHK-110.
 * Do not treat input.total as server authority.
 */
export async function simulateCheckoutPayment(
  input: SimulateCheckoutPaymentInput,
  signal?: AbortSignal,
): Promise<SimulateCheckoutPaymentResult> {
  if (shouldUseMockFixtures("checkout")) {
    return {
      accepted: true,
      status: "paid",
      orderId: "FRS-240712-1848",
      requestId: `mock_checkout_${input.productId}`,
    };
  }

  const response = await apiRequest<
    ApiEnvelope<SimulateCheckoutPaymentResult>,
    SimulateCheckoutPaymentInput
  >("/v1/checkout/simulate-payment", {
    schema: structuralEnvelopeSchema,
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
  });
  return response.data;
}
