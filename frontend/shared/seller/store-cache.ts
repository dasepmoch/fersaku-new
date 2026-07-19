/**
 * INT-150 — clear seller React Query cache for a prior store (or all seller keys).
 */

import type { QueryClient } from "@tanstack/react-query";

/** Cancel + remove seller queries scoped to storeId (or entire seller root). */
export function clearSellerStoreCache(
  client: QueryClient,
  storeId: string | null | undefined,
): void {
  if (storeId) {
    void client.cancelQueries({
      predicate: (q) => isSellerStoreKey(q.queryKey, storeId),
    });
    client.removeQueries({
      predicate: (q) => isSellerStoreKey(q.queryKey, storeId),
    });
    return;
  }
  void client.cancelQueries({
    predicate: (q) => q.queryKey[0] === "seller",
  });
  client.removeQueries({
    predicate: (q) => q.queryKey[0] === "seller",
  });
}

export function isSellerStoreKey(
  queryKey: readonly unknown[],
  storeId: string,
): boolean {
  // queryKeys.seller.* shape: ["seller", storeId, ...]
  return (
    queryKey[0] === "seller" &&
    typeof queryKey[1] === "string" &&
    queryKey[1] === storeId
  );
}
