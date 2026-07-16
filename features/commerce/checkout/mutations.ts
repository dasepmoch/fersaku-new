"use client";

import { useAppMutation } from "@/shared/query/create-mutation";
import {
  simulateCheckoutPayment,
  type SimulateCheckoutPaymentInput,
} from "./api";

export function useSimulateCheckoutPaymentMutation() {
  return useAppMutation({
    mutationKey: ["checkout", "payment", "simulate"],
    mutationFn: (input: SimulateCheckoutPaymentInput, signal) =>
      simulateCheckoutPayment(input, signal),
  });
}
