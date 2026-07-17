export const queryKeys = {
  seller: {
    finance: (storeId: string) => ["seller", storeId, "finance"] as const,
    revenue: (storeId: string, filters: Record<string, unknown> = {}) =>
      ["seller", storeId, "revenue", filters] as const,
    analyticsOverview: (
      storeId: string,
      filters: Record<string, unknown> = {},
    ) => ["seller", storeId, "analytics", "overview", filters] as const,
    analyticsTraffic: (
      storeId: string,
      filters: Record<string, unknown> = {},
    ) => ["seller", storeId, "analytics", "traffic", filters] as const,
    inventory: (storeId: string) => ["seller", storeId, "inventory"] as const,
    inventoryProduct: (storeId: string, productId: string) =>
      ["seller", storeId, "inventory", productId] as const,
    inventoryProductDetail: (storeId: string, productId: string) =>
      ["seller", storeId, "inventory", productId, "detail"] as const,
    inventorySchema: (storeId: string, productId: string) =>
      ["seller", storeId, "inventory", productId, "schema"] as const,
    ledger: (storeId: string) => ["seller", storeId, "ledger"] as const,
    withdrawals: (storeId: string) =>
      ["seller", storeId, "withdrawals"] as const,
    withdrawalLock: (storeId: string) =>
      ["seller", storeId, "withdrawal-lock"] as const,
    orders: (storeId: string, filters: Record<string, unknown>) =>
      ["seller", storeId, "orders", filters] as const,
    order: (storeId: string, orderId: string) =>
      ["seller", storeId, "orders", orderId] as const,
    /**
     * SEL-210: store + filters + bounded profile (no page cursor until UI-080).
     * Prefix ["seller", storeId, "products"] still matches invalidate/clear.
     */
    products: (
      storeId: string,
      filters: Record<string, unknown> = {},
    ) => ["seller", storeId, "products", "bounded", filters] as const,
    product: (storeId: string, productId: string) =>
      ["seller", storeId, "products", productId] as const,
    customers: (storeId: string) => ["seller", storeId, "customers"] as const,
    coupons: (storeId: string) => ["seller", storeId, "coupons"] as const,
    reviews: (storeId: string) => ["seller", storeId, "reviews"] as const,
    reviewsSummary: (storeId: string) =>
      ["seller", storeId, "reviews", "summary"] as const,
    webhooks: (storeId: string) => ["seller", storeId, "webhooks"] as const,
    apiKeys: (storeId: string) => ["seller", storeId, "api-keys"] as const,
    storefront: (storeId: string) => ["seller", storeId, "storefront"] as const,
  },
  admin: {
    merchants: (filters: Record<string, unknown> = {}) =>
      ["admin", "merchants", filters] as const,
    merchant: (merchantId: string) =>
      ["admin", "merchants", merchantId] as const,
    buyers: (filters: Record<string, unknown> = {}) =>
      ["admin", "buyers", filters] as const,
    buyer: (buyerId: string) => ["admin", "buyers", buyerId] as const,
    buyerPurchases: (buyerId: string) =>
      ["admin", "buyers", buyerId, "purchases"] as const,
    buyerSessions: (buyerId: string) =>
      ["admin", "buyers", buyerId, "sessions"] as const,
    orders: (filters: Record<string, unknown> = {}) =>
      ["admin", "orders", filters] as const,
    order: (orderId: string) => ["admin", "orders", orderId] as const,
    withdrawals: (filters: Record<string, unknown> = {}) =>
      ["admin", "withdrawals", filters] as const,
    withdrawal: (withdrawalId: string) =>
      ["admin", "withdrawals", withdrawalId] as const,
    payments: (filters: Record<string, unknown> = {}) =>
      ["admin", "payments", filters] as const,
    kyc: (filters: Record<string, unknown> = {}) =>
      ["admin", "kyc", filters] as const,
    webhooks: (filters: Record<string, unknown> = {}) =>
      ["admin", "webhooks", filters] as const,
    roles: () => ["admin", "roles"] as const,
    users: (filters: Record<string, unknown> = {}) =>
      ["admin", "users", filters] as const,
    campaigns: (filters: Record<string, unknown> = {}) =>
      ["admin", "campaigns", filters] as const,
    providers: () => ["admin", "providers"] as const,
    platformVolume: () => ["admin", "platform-volume"] as const,
    permissionGroups: () => ["admin", "permission-groups"] as const,
    inventory: (filters: Record<string, unknown> = {}) =>
      ["admin", "inventory", filters] as const,
    fulfillment: (filters: Record<string, unknown> = {}) =>
      ["admin", "fulfillment", filters] as const,
    reviews: (filters: Record<string, unknown> = {}) =>
      ["admin", "reviews", filters] as const,
    system: () => ["admin", "system"] as const,
    auditLogs: (filters: Record<string, unknown> = {}) =>
      ["admin", "audit-logs", filters] as const,
  },
  buyer: {
    /**
     * BUY-100: subject/session boundary + filters + bounded list profile.
     * subjectKey = `${subjectId}:${sessionId}` so cache never crosses buyers.
     */
    purchases: (
      subjectKey = "anon",
      filters: Record<string, unknown> = {},
    ) => ["buyer", subjectKey, "purchases", "bounded", filters] as const,
    purchase: (subjectKey: string, orderId: string) =>
      ["buyer", subjectKey, "purchases", orderId] as const,
    profile: () => ["buyer", "profile"] as const,
    sessions: () => ["buyer", "sessions"] as const,
  },
};
