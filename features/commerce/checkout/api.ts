import { apiRequest } from "@/shared/api/http-client";
import type { ApiEnvelope } from "@/shared/api/contracts";
import { isLiveApi } from "@/shared/data/mode";

export type SimulateCheckoutPaymentInput = {
  productId: string;
  storeSlug: string;
  customer: { name: string; email: string };
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

export async function simulateCheckoutPayment(
  input: SimulateCheckoutPaymentInput,
  signal?: AbortSignal,
): Promise<SimulateCheckoutPaymentResult> {
  if (!isLiveApi()) {
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
    method: "POST",
    body: input,
    signal,
    idempotencyKey: input.idempotencyKey,
  });
  return response.data;
}
