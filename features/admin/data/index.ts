export type {
  AdminAuditEvent,
  AdminBoundedList,
  AdminBuyer,
  AdminBuyerPurchase,
  AdminBuyerSession,
  AdminInventoryField,
  AdminListFilters,
  AdminPermissionGroup,
  AdminMerchant,
  AdminOverview,
  AdminPlatformVolumePoint,
  AdminPlatformVolumeSeries,
  AdminTransactionSource,
  AdminOrder,
  AdminPaymentIntent,
  AdminReview,
  AdminRole,
  AdminStockItem,
  AdminStockItemSecret,
  AdminStockProduct,
  AdminWithdrawal,
} from "./contracts";

export { demoMerchants, getMerchant, listMerchants, listMerchantsPage } from "./merchants";
export { demoBuyers, getBuyer, listBuyers, listBuyersPage } from "./buyers";
export {
  demoAdminOrders,
  getAdminOrder,
  listAdminOrders,
  listAdminOrdersPage,
} from "./orders";
export {
  demoWithdrawals,
  getWithdrawal,
  listWithdrawals,
  listWithdrawalsPage,
} from "./withdrawals";
export {
  canReviewWithdrawal,
  type WithdrawalReviewTarget,
} from "./withdrawals";
export { demoPayments, listPayments, listPaymentsPage } from "./payments";
export {
  demoAdminOverview,
  demoAuditEvents,
  demoPlatformVolume,
  getAdminOverview,
  getPlatformVolume,
  listAuditEvents,
} from "./overview";
export {
  demoAdminRoles,
  demoPermissionGroups,
  listAdminRoles,
  listPermissionGroups,
  readMockAdminRoles,
  saveMockAdminRole,
} from "./access";
export { demoInventory, getInventory } from "./inventory";
export {
  revealInventoryItem,
  type RevealInventoryItemInput,
} from "./inventory";
export {
  demoAdminReviews,
  listAdminReviews,
  listAdminReviewsPage,
} from "./reviews";
export {
  executeAdminAction,
  useAdminActionMutation,
  type AdminActionInput,
  type AdminActionResult,
} from "./mutations";
export {
  formatCountId,
  formatSuccessRateBps,
  mapAdminOverviewDto,
  mapAdminMerchantDto,
  mapAdminOrderDto,
  mapAdminPaymentDto,
  mapAdminWithdrawalDto,
  mapPlatformVolumeBuckets,
  normalizeAdminListFilters,
  overviewMetricLabels,
} from "./mappers";

export {
  useAdminBuyer,
  useAdminBuyerPurchases,
  useAdminBuyerSessions,
  useAdminBuyers,
  useAdminAuditEvents,
  useAdminInventory,
  useAdminMerchant,
  useAdminMerchants,
  useAdminOrder,
  useAdminOrders,
  useAdminOverview,
  useAdminPayments,
  useAdminPermissionGroups,
  useAdminPlatformVolume,
  useAdminReviews,
  useAdminRoles,
  useAdminWithdrawal,
  useAdminWithdrawals,
} from "./hooks";
