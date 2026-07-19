/**
 * INT-120 — clear private React Query cache on logout / actor change.
 * Does not touch theme or non-sensitive preference storage.
 */

import type { QueryClient } from "@tanstack/react-query";

const PRIVATE_ROOT_KEYS = new Set([
  "seller",
  "admin",
  "buyer",
  "auth",
  "session",
  "me",
  "profile",
  "notifications",
]);

export function isPrivateQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== "string") return false;
  return PRIVATE_ROOT_KEYS.has(root);
}

/**
 * Remove private domain queries and cancel in-flight private fetches.
 * Theme / public catalog keys are preserved.
 */
export function clearPrivateQueryCache(client: QueryClient): void {
  void client.cancelQueries({
    predicate: (query) => isPrivateQueryKey(query.queryKey),
  });
  client.removeQueries({
    predicate: (query) => isPrivateQueryKey(query.queryKey),
  });
}

/** Optional secret/local session-bound keys that must die with the actor. */
const SECRET_SESSION_KEYS = ["fersaku-impersonation-session-v1"] as const;

export function clearSecretLocalSessionState(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of SECRET_SESSION_KEYS) {
      window.sessionStorage?.removeItem(key);
    }
  } catch {
    // storage may be blocked
  }
}
