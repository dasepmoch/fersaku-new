/**
 * QLT-215 test-only environment guards.
 * Helpers must never be used to boot production.
 */

export function assertNonProductionHarness(): void {
  const appEnv = (process.env.APP_ENV || "local").toLowerCase();
  if (appEnv === "production") {
    throw new Error(
      "QLT-215 helpers refused: APP_ENV=production (test-only harness)",
    );
  }
  if (process.env.E2E_ALLOW_PRODUCTION === "1") {
    throw new Error(
      "QLT-215 helpers refused: E2E_ALLOW_PRODUCTION is not supported",
    );
  }
}

export function apiOrigin(): string {
  assertNonProductionHarness();
  return (
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.E2E_API_ORIGIN?.trim() ||
    "http://127.0.0.1:18080"
  );
}

export function mailpitUrl(): string {
  assertNonProductionHarness();
  return (
    process.env.MAILPIT_URL?.trim() ||
    process.env.E2E_MAILPIT_URL?.trim() ||
    "http://127.0.0.1:8025"
  );
}

/** Local compose default when XENDIT_WEBHOOK_TOKEN is empty (backend app.go). */
export function xenditWebhookToken(): string {
  assertNonProductionHarness();
  return (
    process.env.XENDIT_WEBHOOK_TOKEN?.trim() ||
    process.env.E2E_XENDIT_WEBHOOK_TOKEN?.trim() ||
    "local-xendit-webhook-token"
  );
}

/** QLT-110 nonprod password (documented seed only; not a live secret). */
export const SEED_PASSWORD = "TestSeed1!";

export const SEED_PERSONAS = {
  sellerOwnerA: {
    email: "seller.owner.a@seed.fersaku.test",
    surface: "SELLER" as const,
  },
  buyerA: {
    email: "buyer.a@seed.fersaku.test",
    surface: "BUYER" as const,
  },
} as const;
