/**
 * INT-160 — mutation defaults: no auto-retry, opaque idempotency, pending dedupe.
 */

import {
  beginIdempotencyIntent,
  bindIdempotencyBody,
  createIdempotencyKey,
  requireNewIntentAfterIdempotencyConflict,
  resolveIdempotencySend,
  type IdempotencyIntentState,
} from "@/shared/api/idempotency";

export {
  beginIdempotencyIntent,
  bindIdempotencyBody,
  createIdempotencyKey,
  requireNewIntentAfterIdempotencyConflict,
  resolveIdempotencySend,
  type IdempotencyIntentState,
};

/** Mutations never auto-retry (unknown outcome → reconcile, not duplicate command). */
export const MUTATION_RETRY = false as const;

export type MutationPendingGate = {
  /** True while the logical intent is in flight (including network). */
  isPending: boolean;
  /** Disable exact CTA while pending. */
  disabled: boolean;
};

/**
 * Double-click / concurrent submit guard for a single logical CTA.
 * Returns false if a run is already active; true when the caller may start.
 */
export function createPendingDedupe(): {
  tryBegin: () => boolean;
  end: () => void;
  isPending: () => boolean;
  gate: () => MutationPendingGate;
} {
  let pending = false;
  return {
    tryBegin: () => {
      if (pending) return false;
      pending = true;
      return true;
    },
    end: () => {
      pending = false;
    },
    isPending: () => pending,
    gate: () => ({
      isPending: pending,
      disabled: pending,
    }),
  };
}

/**
 * Hold one opaque idempotency key for a user intent until outcome resolves.
 * Manual retry reuses the same key; call `reset()` only for a new user intent.
 */
export function createIdempotencyIntentHolder(body?: unknown): {
  /** Key for the current logical intent (created lazily on first access). */
  getKey: () => string;
  getIntent: () => IdempotencyIntentState;
  bindBody: (body: unknown) => void;
  resolveSend: (body?: unknown) => ReturnType<typeof resolveIdempotencySend>;
  /** Clear after terminal success/failure so the next CTA is a new intent. */
  reset: () => void;
  /** Peek without minting. */
  peekKey: () => string | undefined;
} {
  let intent: IdempotencyIntentState | undefined =
    body === undefined ? undefined : beginIdempotencyIntent(body);

  const ensure = (): IdempotencyIntentState => {
    if (!intent) intent = beginIdempotencyIntent();
    return intent;
  };

  return {
    getKey: () => ensure().key,
    getIntent: () => ensure(),
    bindBody: (nextBody: unknown) => {
      intent = bindIdempotencyBody(ensure(), nextBody);
    },
    resolveSend: (nextBody?: unknown) =>
      resolveIdempotencySend(ensure(), nextBody),
    reset: () => {
      intent = undefined;
    },
    peekKey: () => intent?.key,
  };
}

/**
 * Opaque UUID only — rejects keys that embed email/store/amount/PII patterns.
 * Use for tests and defensive guards; production keys come from createIdempotencyKey.
 */
export function isOpaqueIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.includes("@")) return false;
  if (/email|store|amount|phone|password|secret/i.test(key)) return false;
  // UUID v4-ish or fallback idem_* form from createIdempotencyKey
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const fallback = /^idem_[a-z0-9]+_[a-z0-9]+$/i;
  return uuid.test(key) || fallback.test(key);
}
