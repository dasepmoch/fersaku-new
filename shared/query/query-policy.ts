/**
 * INT-160 — query defaults: stale policies, keepPreviousData, safe GET retry.
 * Domain hooks inherit via useAppQuery / AppQueryProvider.
 */

import { keepPreviousData, type Query } from "@tanstack/react-query";

/** Public catalog / marketing reads — short cache, may revalidate. */
export const STALE_TIME_PUBLIC_MS = 60_000;

/** Authenticated workspace lists/details — moderate freshness. */
export const STALE_TIME_PRIVATE_MS = 30_000;

/** Finance / money surfaces — short stale; never treat as long-lived. */
export const STALE_TIME_FINANCE_MS = 15_000;

/** Secret / credential / inventory-reveal class — always stale (no cache comfort). */
export const STALE_TIME_SECRET_MS = 0;

/** Default when surface is unspecified (private workspace). */
export const STALE_TIME_DEFAULT_MS = STALE_TIME_PRIVATE_MS;

export const GC_TIME_DEFAULT_MS = 5 * 60_000;

export type QuerySurface =
  | "public"
  | "private"
  | "finance"
  | "secret"
  | "auth";

export function staleTimeForSurface(surface: QuerySurface): number {
  switch (surface) {
    case "public":
      return STALE_TIME_PUBLIC_MS;
    case "finance":
      return STALE_TIME_FINANCE_MS;
    case "secret":
    case "auth":
      return STALE_TIME_SECRET_MS;
    case "private":
    default:
      return STALE_TIME_PRIVATE_MS;
  }
}

/**
 * Keep prior page/filter data visible while the next key loads.
 * Prefer this over blank loading flashes on table/chart filter changes.
 */
export const keepPreviousQueryData = keepPreviousData;

/** Options fragment for filtered/cursor list queries. */
export function withKeepPreviousData<T extends object>(
  options?: T,
): T & { placeholderData: typeof keepPreviousData } {
  return {
    ...(options as T),
    placeholderData: keepPreviousData,
  };
}

const MAX_SAFE_GET_RETRIES = 2;

function statusFromError(error: unknown): number | undefined {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

function retryAfterSecondsFromError(error: unknown): number | undefined {
  if (typeof error === "object" && error && "retryAfterSeconds" in error) {
    const value = Number((error as { retryAfterSeconds?: unknown }).retryAfterSeconds);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

/**
 * Safe GET only: network / 408 / 429 / 5xx. Never 4xx auth/validation.
 * Client transport is single-shot; React Query owns this retry layer.
 */
export function isSafeGetRetryableError(error: unknown): boolean {
  const status = statusFromError(error);
  if (status === undefined) {
    // Network / abort-unrelated failures without HTTP status
    if (error instanceof TypeError) return true;
    if (
      typeof error === "object" &&
      error &&
      "phase" in error &&
      (error as { phase?: string }).phase === "network"
    ) {
      return true;
    }
    return false;
  }
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

export function shouldRetrySafeGet(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= MAX_SAFE_GET_RETRIES) return false;
  return isSafeGetRetryableError(error);
}

/**
 * Exponential backoff + jitter; honors Retry-After seconds when present.
 * delay index is 0-based attempt after first failure.
 */
export function safeGetRetryDelay(
  attemptIndex: number,
  error?: unknown,
): number {
  const retryAfter = error ? retryAfterSecondsFromError(error) : undefined;
  if (retryAfter !== undefined) {
    return Math.min(retryAfter * 1000, 30_000);
  }
  const base = Math.min(1000 * 2 ** attemptIndex, 8_000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

/** QueryClient defaultOptions.queries fragment. */
export const defaultQueryOptions = {
  staleTime: STALE_TIME_DEFAULT_MS,
  gcTime: GC_TIME_DEFAULT_MS,
  refetchOnWindowFocus: false as const,
  retry: shouldRetrySafeGet,
  retryDelay: (attemptIndex: number, error: Error) =>
    safeGetRetryDelay(attemptIndex, error),
};

/**
 * Forbidden substrings in query keys (secrets must not enter persistent cache keys).
 * Values may still be redacted at the reporter layer; keys must stay free of these.
 */
const FORBIDDEN_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /mfa[_-]?proof/i,
  /csrf/i,
  /authorization/i,
  /bearer\s/i,
  /api[_-]?key/i,
  /raw[_-]?credential/i,
  /inventory[_-]?secret/i,
  /qr[_-]?payload/i,
  /one[_-]?time/i,
];

export function queryKeyLooksSensitive(queryKey: readonly unknown[]): boolean {
  const flat = JSON.stringify(queryKey);
  return FORBIDDEN_KEY_PATTERNS.some((re) => re.test(flat));
}

/** Predicate helper for exact key invalidation (prefer over broad prefixes). */
export function matchesExactQueryKey(
  query: Query,
  key: readonly unknown[],
): boolean {
  const qk = query.queryKey;
  if (qk.length !== key.length) return false;
  return qk.every((part, i) => Object.is(part, key[i]));
}
