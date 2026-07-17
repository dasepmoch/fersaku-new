"use client";

import { useAppMutation } from "@/shared/query/create-mutation";
import {
  requestCheckoutQuote,
  simulateCheckoutPayment,
  type SimulateCheckoutPaymentInput,
} from "./api";
import type { CheckoutQuoteSelection } from "./contracts";

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

/** Mock/local simulate only — live create intent is CHK-110. */
export function useSimulateCheckoutPaymentMutation() {
  return useAppMutation({
    mutationKey: ["checkout", "payment", "simulate"],
    mutationFn: (input: SimulateCheckoutPaymentInput, signal) =>
      simulateCheckoutPayment(input, signal),
  });
}
