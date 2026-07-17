"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckoutQuote, CheckoutQuoteSelection } from "./contracts";
import { requestCheckoutQuote } from "./api";

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
          if (
            err instanceof DOMException &&
            err.name === "AbortError"
          ) {
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
