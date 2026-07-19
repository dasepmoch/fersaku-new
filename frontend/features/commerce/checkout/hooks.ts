"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import type {
  CheckoutIntent,
  CheckoutQuote,
  CheckoutQuoteSelection,
} from "./contracts";
import { getCheckoutIntent, requestCheckoutQuote } from "./api";
import {
  createCheckoutIntentPollController,
  formatCountdownMmSs,
  remainingSecondsUntil,
} from "./poll";

const DEFAULT_DEBOUNCE_MS = 280;

export type UseCheckoutQuoteState = {
  quote: CheckoutQuote | null;
  quoting: boolean;
  quoteError: Error | null;
};

/**
 * Debounced re-quote with cancel + sequence guard.
 * Stale responses must not overwrite a newer selection (CHK-100).
 */
export function useCheckoutQuote(
  selection: CheckoutQuoteSelection | null,
  options?: {
    catalogPrice?: number;
    debounceMs?: number;
    enabled?: boolean;
  },
): UseCheckoutQuoteState {
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<Error | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storeId = selection?.storeId ?? "";
  const productId = selection?.productId ?? "";
  const merchandise = selection?.merchandise;
  const tip = selection?.tip ?? 0;
  const upsell = selection?.upsell ?? 0;
  const couponCode = selection?.couponCode;
  const catalogPrice = options?.catalogPrice;
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const enabled = options?.enabled !== false && Boolean(storeId && productId);

  useEffect(() => {
    if (!enabled || !selection) {
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const seq = ++seqRef.current;

    timerRef.current = setTimeout(() => {
      const ac = new AbortController();
      abortRef.current = ac;
      setQuoting(true);
      setQuoteError(null);
      void (async () => {
        try {
          const next = await requestCheckoutQuote(
            {
              storeId,
              productId,
              merchandise,
              tip,
              upsell,
              couponCode,
            },
            { signal: ac.signal, catalogPrice },
          );
          if (seq !== seqRef.current) return;
          if (ac.signal.aborted) return;
          setQuote(next);
          setQuoteError(null);
        } catch (err) {
          if (ac.signal.aborted) return;
          if (seq !== seqRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          setQuoteError(err instanceof Error ? err : new Error("quote failed"));
        } finally {
          if (seq === seqRef.current) setQuoting(false);
        }
      })();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [
    enabled,
    storeId,
    productId,
    merchandise,
    tip,
    upsell,
    couponCode,
    catalogPrice,
    debounceMs,
    selection,
  ]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  return { quote, quoting, quoteError };
}

export type UseCheckoutIntentPollOptions = {
  /** When false, poll is stopped. */
  enabled?: boolean;
  onPaid?: (intent: CheckoutIntent) => void;
  onTerminalNonPaid?: (intent: CheckoutIntent) => void;
};

export type UseCheckoutIntentPollState = {
  intent: CheckoutIntent | null;
  /** Server-calibrated mm:ss when expiresAt present; null when N/A. */
  countdown: string | null;
  remainingSeconds: number | null;
  polling: boolean;
};

/**
 * Bounded poll of GET /v1/checkout/intents/{id} until terminal (CHK-120).
 * Abort on unmount / intent change / terminal. No auto-create on failure.
 * Only backend PAID invokes onPaid.
 */
export function useCheckoutIntentPoll(
  intentId: string | null | undefined,
  options?: UseCheckoutIntentPollOptions,
): UseCheckoutIntentPollState {
  const [intent, setIntent] = useState<CheckoutIntent | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const expiresAtRef = useRef<string | undefined>(undefined);
  const onPaidRef = useRef(options?.onPaid);
  const onTerminalRef = useRef(options?.onTerminalNonPaid);
  const enabled = options?.enabled !== false && Boolean(intentId);
  const polling = enabled;

  useEffect(() => {
    onPaidRef.current = options?.onPaid;
    onTerminalRef.current = options?.onTerminalNonPaid;
  }, [options?.onPaid, options?.onTerminalNonPaid]);

  useEffect(() => {
    if (!enabled || !intentId) {
      return;
    }

    const controller = createCheckoutIntentPollController<CheckoutIntent>({
      fetchIntent: async (id, signal) => getCheckoutIntent(id, signal),
      mapResult: (raw) => raw as CheckoutIntent,
      getStatus: (i) => i.status,
      onUpdate: (next) => {
        setIntent(next);
        expiresAtRef.current = next.expiresAt;
        setRemainingSeconds(remainingSecondsUntil(next.expiresAt));
      },
      onPaid: (next) => {
        setIntent(next);
        onPaidRef.current?.(next);
      },
      onTerminalNonPaid: (next) => {
        setIntent(next);
        onTerminalRef.current?.(next);
      },
      retryAfterFromError: (err) => {
        if (err instanceof ApiError && err.retryAfterSeconds != null) {
          return err.retryAfterSeconds;
        }
        return undefined;
      },
    });

    controller.start(intentId, { immediate: true });

    const onVisible = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        controller.refreshNow();
      }
    };
    const onOnline = () => controller.refreshNow();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }

    return () => {
      controller.stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
    };
  }, [enabled, intentId]);

  // Server expiresAt countdown (1s tick); never authority for paid.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setRemainingSeconds(remainingSecondsUntil(expiresAtRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, intent?.expiresAt]);

  const countdown =
    remainingSeconds != null ? formatCountdownMmSs(remainingSeconds) : null;

  return { intent, countdown, remainingSeconds, polling };
}
