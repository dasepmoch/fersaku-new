/**
 * INT-020 idempotency key policy.
 * - Stable UUID per logical user intent
 * - Same key + same canonical body → replay same result
 * - Same key + different body → 409 IDEMPOTENCY_CONFLICT (do not auto-rotate key)
 */

export type IdempotencyIntentState = {
  key: string;
  /** Canonical body fingerprint (JSON string or hash); optional until body known. */
  bodyFingerprint?: string;
  createdAt: number;
};

export type IdempotencyDecision =
  | { action: "send"; key: string }
  | { action: "reuse"; key: string }
  | {
      action: "conflict_local";
      key: string;
      reason: "body_mismatch";
    };

let fallbackSequence = 0;

/**
 * Cryptographically random UUID when available; stable fallback otherwise.
 * Key must not embed email/store/amount/PII or timestamp-only uniqueness.
 */
export function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  fallbackSequence += 1;
  const rand = Math.random().toString(36).slice(2, 12);
  return `idem_${fallbackSequence.toString(36)}_${rand}`;
}

/**
 * Canonical fingerprint for mutation body comparison.
 * Stable key ordering for plain objects; primitives/arrays via JSON.
 */
export function fingerprintBody(body: unknown): string {
  if (body === undefined) return "";
  return JSON.stringify(canonicalize(body));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = canonicalize(record[key]);
  }
  return out;
}

/**
 * Start a new logical intent (user explicitly starts action).
 * Store key in-memory until outcome resolves (INT-160 owns full mutation policy).
 */
export function beginIdempotencyIntent(body?: unknown): IdempotencyIntentState {
  return {
    key: createIdempotencyKey(),
    bodyFingerprint:
      body === undefined ? undefined : fingerprintBody(body),
    createdAt: Date.now(),
  };
}

/**
 * Decide how to send a mutation with an existing intent.
 * Manual retry/recovery reuses the same key; body change is local conflict
 * (mirrors server IDEMPOTENCY_CONFLICT — do not mint a new key automatically).
 */
export function resolveIdempotencySend(
  intent: IdempotencyIntentState,
  body?: unknown,
): IdempotencyDecision {
  if (body === undefined) {
    return { action: "reuse", key: intent.key };
  }
  if (intent.bodyFingerprint === undefined) {
    return { action: "send", key: intent.key };
  }
  const next = fingerprintBody(body);
  if (next !== intent.bodyFingerprint) {
    return {
      action: "conflict_local",
      key: intent.key,
      reason: "body_mismatch",
    };
  }
  return { action: "reuse", key: intent.key };
}

/**
 * Attach body fingerprint after first successful serialization of intent body.
 */
export function bindIdempotencyBody(
  intent: IdempotencyIntentState,
  body: unknown,
): IdempotencyIntentState {
  return {
    ...intent,
    bodyFingerprint: fingerprintBody(body),
  };
}

/**
 * After IDEMPOTENCY_CONFLICT classification, callers must require a new
 * user intent — never auto-call createIdempotencyKey for the same CTA.
 */
export function requireNewIntentAfterIdempotencyConflict(): {
  mustCreateNewIntent: true;
  autoRotateKey: false;
} {
  return { mustCreateNewIntent: true, autoRotateKey: false };
}
