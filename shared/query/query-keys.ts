export const queryKeys = {
  seller: {
    finance: (storeId: string) => ["seller", storeId, "finance"] as const,
    ledger: (storeId: string) => ["seller", storeId, "ledger"] as const,
    withdrawals: (storeId: string) =>
      ["seller", storeId, "withdrawals"] as const,
    withdrawalLock: (storeId: string) =>
      ["seller", storeId, "withdrawal-lock"] as const,
    orders: (storeId: string, filters: Record<string, unknown>) =>
      ["seller", storeId, "orders", filters] as const,
    order: (storeId: string, orderId: string) =>
      ["seller", storeId, "orders", orderId] as const,
    products: (storeId: string) => ["seller", storeId, "products"] as const,
    product: (storeId: string, productId: string) =>
      ["seller", storeId, "products", productId] as const,
  },
  admin: {
    merchants: (filters: Record<string, unknown>) =>
      ["admin", "merchants", filters] as const,
    reconciliation: (filters: Record<string, unknown>) =>
      ["admin", "reconciliation", filters] as const,
    disputes: (filters: Record<string, unknown>) =>
      ["admin", "disputes", filters] as const,
  },
};
