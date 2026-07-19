/**
 * CHK-120 — authoritative checkout intent poll helpers.
 * Safe GET only; no auto-create; terminal states stop the loop.
 */

import type { CheckoutIntentStatus } from "./contracts";

/** Backend terminal statuses — only PAID may advance to success UI. */
const TERMINAL: ReadonlySet<CheckoutIntentStatus> = new Set([
  "PAID",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);

const NON_PAID_TERMINAL: ReadonlySet<CheckoutIntentStatus> = new Set([
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);

export function isCheckoutIntentTerminal(
  status: CheckoutIntentStatus,
): boolean {
  return TERMINAL.has(status);
}

export function isCheckoutIntentPaid(status: CheckoutIntentStatus): boolean {
  return status === "PAID";
}

export function isCheckoutIntentNonPaidTerminal(
  status: CheckoutIntentStatus,
): boolean {
  return NON_PAID_TERMINAL.has(status);
}

/** Still waiting for provider / intermediate machine states. */
export function isCheckoutIntentPendingPoll(
  status: CheckoutIntentStatus,
): boolean {
  return !isCheckoutIntentTerminal(status);
}

export type PollBackoffOptions = {
  attempt: number;
  /** Document hidden → slower cadence. */
  hidden?: boolean;
  /** Seconds from Retry-After when present. */
  retryAfterSeconds?: number;
  /** Injected RNG for tests (0..1). */
  random?: () => number;
};

const BASE_MS = 1_500;
const MAX_VISIBLE_MS = 12_000;
const MAX_HIDDEN_MS = 30_000;
const JITTER_MS = 400;

/**
 * Bounded exponential backoff + jitter.
 * Faster initially; slower when hidden; honors Retry-After.
 */
export function nextCheckoutPollDelayMs(options: PollBackoffOptions): number {
  const {
    attempt,
    hidden = false,
    retryAfterSeconds,
    random = Math.random,
  } = options;

  if (
    retryAfterSeconds !== undefined &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    const cap = hidden ? MAX_HIDDEN_MS : MAX_VISIBLE_MS;
    return Math.min(retryAfterSeconds * 1000, cap);
  }

  const exp = Math.min(BASE_MS * 2 ** Math.max(0, attempt), MAX_VISIBLE_MS);
  const jitter = Math.floor(random() * JITTER_MS);
  const delay = exp + jitter;
  if (hidden) {
    return Math.min(Math.max(delay * 3, 8_000), MAX_HIDDEN_MS);
  }
  return delay;
}

/**
 * Remaining seconds until server expiresAt, calibrated to client clock.
 * Returns 0 when expired/invalid; null when no server expiry.
 */
export function remainingSecondsUntil(
  expiresAt: string | undefined | null,
  nowMs: number = Date.now(),
): number | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}

export function formatCountdownMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export type IntentPollFetch = (
  intentId: string,
  signal: AbortSignal,
) => Promise<{
  status: CheckoutIntentStatus;
  paymentIntentId: string;
  orderId: string;
  orderNumber?: string;
  expiresAt?: string;
  qrString?: string | null;
  qrImageUrl?: string | null;
  amount?: number;
  gross?: number;
  /** Optional Retry-After from last error path — not used on success. */
  retryAfterSeconds?: number;
}>;

export type IntentPollHandlers<T> = {
  fetchIntent: IntentPollFetch;
  onUpdate: (intent: T) => void;
  onPaid: (intent: T) => void;
  onTerminalNonPaid: (intent: T) => void;
  /** Map fetch result to T (usually CheckoutIntent). */
  mapResult: (raw: Awaited<ReturnType<IntentPollFetch>>) => T;
  getStatus: (intent: T) => CheckoutIntentStatus;
  /** Optional: read retry-after from thrown errors. */
  retryAfterFromError?: (err: unknown) => number | undefined;
  isDocumentHidden?: () => boolean;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearSchedule?: (id: ReturnType<typeof setTimeout>) => void;
  random?: () => number;
};

/**
 * Single-flight poll loop: no overlapping GETs; abort on unmount/terminal/new intent.
 * Does not create intents. Poll failure never marks paid.
 */
export function createCheckoutIntentPollController<T>(
  handlers: IntentPollHandlers<T>,
) {
  const schedule =
    handlers.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearSchedule =
    handlers.clearSchedule ??
    ((id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  const isHidden =
    handlers.isDocumentHidden ??
    (() =>
      typeof document !== "undefined"
        ? document.visibilityState === "hidden"
        : false);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let ac: AbortController | null = null;
  let attempt = 0;
  let stopped = true;
  let inFlight = false;
  let activeIntentId: string | null = null;
  let lastRetryAfter: number | undefined;

  const clearTimer = () => {
    if (timer != null) {
      clearSchedule(timer);
      timer = null;
    }
  };

  const stop = () => {
    stopped = true;
    activeIntentId = null;
    attempt = 0;
    lastRetryAfter = undefined;
    clearTimer();
    ac?.abort();
    ac = null;
    inFlight = false;
  };

  const runOnce = async () => {
    if (stopped || !activeIntentId || inFlight) return;
    inFlight = true;
    ac?.abort();
    const controller = new AbortController();
    ac = controller;
    const intentId = activeIntentId;

    try {
      const raw = await handlers.fetchIntent(intentId, controller.signal);
      if (stopped || activeIntentId !== intentId || controller.signal.aborted) {
        return;
      }
      const mapped = handlers.mapResult(raw);
      handlers.onUpdate(mapped);
      const status = handlers.getStatus(mapped);
      if (isCheckoutIntentPaid(status)) {
        stop();
        handlers.onPaid(mapped);
        return;
      }
      if (isCheckoutIntentNonPaidTerminal(status)) {
        stop();
        handlers.onTerminalNonPaid(mapped);
        return;
      }
      attempt += 1;
      lastRetryAfter = undefined;
      queueNext();
    } catch (err) {
      if (controller.signal.aborted || stopped) return;
      // Never treat poll errors as paid. Back off and continue if still active.
      lastRetryAfter = handlers.retryAfterFromError?.(err);
      attempt += 1;
      queueNext();
    } finally {
      inFlight = false;
    }
  };

  const queueNext = () => {
    if (stopped || !activeIntentId) return;
    clearTimer();
    const delay = nextCheckoutPollDelayMs({
      attempt: Math.max(0, attempt - 1),
      hidden: isHidden(),
      retryAfterSeconds: lastRetryAfter,
      random: handlers.random,
    });
    timer = schedule(() => {
      timer = null;
      void runOnce();
    }, delay);
  };

  const start = (intentId: string, options?: { immediate?: boolean }) => {
    if (!intentId) return;
    // New intent replaces previous loop.
    stop();
    stopped = false;
    activeIntentId = intentId;
    attempt = 0;
    lastRetryAfter = undefined;
    if (options?.immediate !== false) {
      void runOnce();
    } else {
      queueNext();
    }
  };

  /** Immediate refresh (visibility/online); no-op if stopped or in-flight. */
  const refreshNow = () => {
    if (stopped || !activeIntentId) return;
    clearTimer();
    if (!inFlight) void runOnce();
  };

  return { start, stop, refreshNow };
}
