/**
 * ADM-350 mock fixtures — snapshot seed for non-api domain.
 */

import { initialWebhooks, type WebhookRow } from "./data";

export function demoAdminWebhooks(): WebhookRow[] {
  return initialWebhooks.map((row) => ({ ...row }));
}

export function demoAdminWebhookById(id: string): WebhookRow | null {
  const found = initialWebhooks.find((r) => r.id === id);
  return found ? { ...found } : null;
}
