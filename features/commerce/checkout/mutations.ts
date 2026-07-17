"use client";

import { useAppMutation } from "@/shared/query/create-mutation";
import {
  createCheckoutIntent,
  requestCheckoutQuote,
  simulateCheckoutPayment,
  type SimulateCheckoutPaymentInput,
} from "./api";
import type {
  CheckoutQuoteSelection,
  CreateCheckoutIntentInput,
} from "./contracts";

/** CHK-100 quote mutation (manual re-quote). Prefer useCheckoutQuote for debounced path. */
export function useCheckoutQuoteMutation() {
  return useAppMutation({
    mutationKey: ["checkout", "quote"],
    mutationFn: (
      input: CheckoutQuoteSelection & { catalogPrice?: number },
      signal,
    ) =>
      requestCheckoutQuote(
        {
          storeId: input.storeId,
          productId: input.productId,
          merchandise: input.merchandise,
          tip: input.tip,
          upsell: input.upsell,
          couponCode: input.couponCode,
        },
        { signal, catalogPrice: input.catalogPrice },
      ),
  });
}

/** CHK-110: create payment intent (api domain). No auto-retry. */
export function useCreateCheckoutIntentMutation() {
  return useAppMutation({
    mutationKey: ["checkout", "intent", "create"],
    mutationFn: (input: CreateCheckoutIntentInput, signal) =>
      createCheckoutIntent(input, signal),
  });
}

/** Mock/local simulate only — never live (CHK-110). */
export function useSimulateCheckoutPaymentMutation() {
  return useAppMutation({
    mutationKey: ["checkout", "payment", "simulate"],
    mutationFn: (input: SimulateCheckoutPaymentInput, signal) =>
      simulateCheckoutPayment(input, signal),
  });
}
