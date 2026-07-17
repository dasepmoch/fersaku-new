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
    /**
     * SEL-400: store + optional source/cursor + CursorList first-page profile.
     * Prefix ["seller", storeId, "ledger"] still matches invalidate/clear.
     */
    ledger: (storeId: string, filters: Record<string, unknown> = {}) =>
      ["seller", storeId, "ledger", filters] as const,
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
    /**
     * SEL-260: store + filters + NumberedPageList profile.
     * Prefix ["seller", storeId, "customers"] still matches invalidate/clear.
     */
    customers: (
      storeId: string,
      filters: Record<string, unknown> = {},
    ) => ["seller", storeId, "customers", filters] as const,
    customer: (storeId: string, customerId: string) =>
      ["seller", storeId, "customers", customerId] as const,
    /**
     * SEL-280: store-scoped coupon list. Client TablePagination over full list
     * until BE exposes NumberedPageList meta (snapshot keeps TablePagination).
     */
    coupons: (storeId: string) => ["seller", storeId, "coupons"] as const,
    coupon: (storeId: string, couponId: string) =>
      ["seller", storeId, "coupons", couponId] as const,
    reviews: (storeId: string) => ["seller", storeId, "reviews"] as const,
    reviewsSummary: (storeId: string) =>
      ["seller", storeId, "reviews", "summary"] as const,
    webhooks: (storeId: string) => ["seller", storeId, "webhooks"] as const,
    apiKeys: (storeId: string) => ["seller", storeId, "api-keys"] as const,
    storefront: (storeId: string) => ["seller", storeId, "storefront"] as const,
    /**
     * SEL-340: actor-scoped profile/prefs (me endpoints).
     * subjectKey = `${subjectId}:${sessionId}` so cache never crosses sellers.
     */
    profile: (subjectKey = "anon") =>
      ["seller", subjectKey, "profile"] as const,
    notificationPreferences: (subjectKey = "anon") =>
      ["seller", subjectKey, "notification-preferences"] as const,
    sessions: (subjectKey = "anon") =>
      ["seller", subjectKey, "sessions"] as const,
    /**
     * SEL-340: store-scoped bank accounts (masked only; never full number in key).
     */
    bankAccounts: (storeId: string) =>
      ["seller", storeId, "bank-accounts"] as const,
    bankAccount: (storeId: string, bankId: string) =>
      ["seller", storeId, "bank-accounts", bankId] as const,
  },
  admin: {
    /** ADM-120 overview aggregate (admin.dashboard.read). */
    overview: () => ["admin", "overview"] as const,
    merchants: (filters: Record<string, unknown> = {}) =>
      ["admin", "merchants", "bounded", filters] as const,
    merchant: (merchantId: string) =>
      ["admin", "merchants", merchantId] as const,
    /** ADM-200 finance projection + credential metadata. */
    merchantFinance: (merchantId: string) =>
      ["admin", "merchants", merchantId, "finance"] as const,
    merchantCredentials: (merchantId: string) =>
      ["admin", "merchants", merchantId, "credentials"] as const,
    buyers: (filters: Record<string, unknown> = {}) =>
      ["admin", "buyers", "bounded", filters] as const,
    buyer: (buyerId: string) => ["admin", "buyers", buyerId] as const,
    buyerPurchases: (buyerId: string) =>
      ["admin", "buyers", buyerId, "purchases"] as const,
    buyerSessions: (buyerId: string) =>
      ["admin", "buyers", buyerId, "sessions"] as const,
    orders: (filters: Record<string, unknown> = {}) =>
      ["admin", "orders", "bounded", filters] as const,
    order: (orderId: string) => ["admin", "orders", orderId] as const,
    withdrawals: (filters: Record<string, unknown> = {}) =>
      ["admin", "withdrawals", "bounded", filters] as const,
    withdrawal: (withdrawalId: string) =>
      ["admin", "withdrawals", withdrawalId] as const,
    payments: (filters: Record<string, unknown> = {}) =>
      ["admin", "payments", "bounded", filters] as const,
    /** ADM-300 payment intent detail. */
    payment: (paymentIntentId: string) =>
      ["admin", "payments", paymentIntentId] as const,
    /** ADM-300 provider/local mismatch evidence feed. */
    paymentMismatches: () => ["admin", "payment-mismatches"] as const,
    kyc: (filters: Record<string, unknown> = {}) =>
      ["admin", "kyc", "bounded", filters] as const,
    webhooks: (filters: Record<string, unknown> = {}) =>
      ["admin", "webhooks", "bounded", filters] as const,
    roles: () => ["admin", "roles"] as const,
    /** ADM-220 role detail (roles.read). */
    role: (roleId: string) => ["admin", "roles", roleId] as const,
    users: (filters: Record<string, unknown> = {}) =>
      ["admin", "users", "bounded", filters] as const,
    /** ADM-220 user detail + role assignments. */
    user: (userId: string) => ["admin", "users", userId] as const,
    userRoles: (userId: string) =>
      ["admin", "users", userId, "roles"] as const,
    staffInvitations: () => ["admin", "invitations", "staff"] as const,
    campaigns: (filters: Record<string, unknown> = {}) =>
      ["admin", "campaigns", "bounded", filters] as const,
    providers: () => ["admin", "providers"] as const,
    platformVolume: () => ["admin", "platform-volume"] as const,
    permissionGroups: () => ["admin", "permission-groups"] as const,
    inventory: (filters: Record<string, unknown> = {}) =>
      ["admin", "inventory", "bounded", filters] as const,
    fulfillment: (filters: Record<string, unknown> = {}) =>
      ["admin", "fulfillment", "bounded", filters] as const,
    reviews: (filters: Record<string, unknown> = {}) =>
      ["admin", "reviews", "bounded", filters] as const,
    system: () => ["admin", "system"] as const,
    auditLogs: (filters: Record<string, unknown> = {}) =>
      ["admin", "audit-logs", "bounded", filters] as const,
    /**
     * ADM-230: own admin profile/prefs/sessions — subject/session-bound.
     * subjectKey = `${subjectId}:${sessionId}` so cache never crosses staff.
     */
    profile: (subjectKey = "anon") =>
      ["admin", subjectKey, "profile"] as const,
    notificationPreferences: (subjectKey = "anon") =>
      ["admin", subjectKey, "notification-preferences"] as const,
    sessions: (subjectKey = "anon") =>
      ["admin", subjectKey, "sessions"] as const,
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
    /**
     * BUY-110: buyer-owned review by order item (session-bound).
     */
    review: (subjectKey: string, orderItemId: string) =>
      ["buyer", subjectKey, "reviews", orderItemId] as const,
    /**
     * BUY-120: profile + prefs are subject/session-bound (own account only).
     * subjectKey = `${subjectId}:${sessionId}` so cache never crosses buyers.
     */
    profile: (subjectKey = "anon") =>
      ["buyer", subjectKey, "profile"] as const,
    notificationPreferences: (subjectKey = "anon") =>
      ["buyer", subjectKey, "notification-preferences"] as const,
    /**
     * BUY-130: session list is subject/session-bound (own sessions only).
     * subjectKey = `${subjectId}:${sessionId}` so cache never crosses buyers.
     */
    sessions: (subjectKey = "anon") =>
      ["buyer", subjectKey, "sessions"] as const,
  },
  /**
   * Public product review list/summary — invalidated after buyer review success.
   */
  public: {
    productReviews: (productId: string) =>
      ["public", "products", productId, "reviews"] as const,
    productReviewSummary: (productId: string) =>
      ["public", "products", productId, "reviews", "summary"] as const,
  },
  /**
   * BUY-140: shared notification center — surface + subject/session bound.
   * Root "notifications" is cleared on logout via private-cache.
   * subjectKey = `${subjectId}:${sessionId}` so cache never crosses actors.
   */
  notifications: {
    list: (surface: string, subjectKey = "anon") =>
      ["notifications", surface, subjectKey, "list"] as const,
    unreadCount: (surface: string, subjectKey = "anon") =>
      ["notifications", surface, subjectKey, "unread-count"] as const,
  },
};
