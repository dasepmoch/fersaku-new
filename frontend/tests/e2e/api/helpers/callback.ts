/**
 * QLT-215 signed fake-provider callback helper — test environment only.
 * Posts to local/fake Xendit ingress with X-Callback-Token.
 * Cannot boot production: refuses APP_ENV=production and live mode.
 */

import {
  apiOrigin,
  assertNonProductionHarness,
  xenditWebhookToken,
} from "./env";

export type FakePaidCallbackInput = {
  eventId: string;
  providerRef: string;
  externalId: string;
  amount: number;
  currency?: string;
};

export function buildXenditPaidBody(input: FakePaidCallbackInput): string {
  assertNonProductionHarness();
  const currency = input.currency || "IDR";
  return JSON.stringify({
    id: input.eventId,
    event: "qr.payment",
    data: {
      id: input.providerRef,
      external_id: input.externalId,
      status: "SUCCEEDED",
      amount: input.amount,
      currency,
    },
  });
}

export type CallbackResult = {
  status: number;
  body: string;
  /** Sanitized for logs/traces — never includes token. */
  summary: string;
};

/**
 * POST /v1/webhooks/xendit with local webhook token.
 * Uses fake provider stack only (compose XENDIT_MODE=fake).
 */
export async function postFakeXenditPaidCallback(
  input: FakePaidCallbackInput,
  options?: { token?: string; path?: string },
): Promise<CallbackResult> {
  assertNonProductionHarness();

  if ((process.env.XENDIT_MODE || "fake").toLowerCase() === "live") {
    throw new Error(
      "QLT-215 callback helper refused: XENDIT_MODE=live (test fake only)",
    );
  }

  const origin = apiOrigin().replace(/\/+$/, "");
  const path = options?.path || "/v1/webhooks/xendit";
  const token = options?.token ?? xenditWebhookToken();
  const body = buildXenditPaidBody(input);

  const res = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Callback-Token": token,
      Accept: "application/json",
    },
    body,
  });

  const text = await res.text();
  return {
    status: res.status,
    body: text,
    summary: `xendit-callback status=${res.status} eventId=${input.eventId} amount=${input.amount}`,
  };
}

/**
 * Local/test seam: POST /v1/checkout/simulate-payment (env-guarded on API).
 * Prefer real signed callback for product tests; simulate is harness convenience.
 */
export async function postSimulatePayment(
  paymentIntentId: string,
): Promise<CallbackResult> {
  assertNonProductionHarness();
  const origin = apiOrigin().replace(/\/+$/, "");
  const res = await fetch(`${origin}/v1/checkout/simulate-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      paymentIntentId,
      intentId: paymentIntentId,
    }),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text,
    summary: `simulate-payment status=${res.status} intent=${paymentIntentId.slice(0, 8)}…`,
  };
}
