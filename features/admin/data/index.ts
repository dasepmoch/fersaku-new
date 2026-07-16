export type {
  AdminAuditEvent,
  AdminBuyer,
  AdminBuyerPurchase,
  AdminBuyerSession,
  AdminInventoryField,
  AdminPermissionGroup,
  AdminMerchant,
  AdminOrder,
  AdminPaymentIntent,
  AdminReview,
  AdminRiskCase,
  AdminRole,
  AdminStockItem,
  AdminStockProduct,
  AdminWithdrawal,
} from "./contracts";

export { demoMerchants, getMerchant, listMerchants } from "./merchants";
export { demoBuyers, getBuyer, listBuyers } from "./buyers";
export { demoAdminOrders, getAdminOrder, listAdminOrders } from "./orders";
export { demoWithdrawals, getWithdrawal, listWithdrawals } from "./withdrawals";
export { demoPayments, listPayments } from "./payments";
export {
  demoAuditEvents,
  demoPlatformVolume,
  getPlatformVolume,
  listAuditEvents,
} from "./overview";
export {
  demoAdminRoles,
  demoPermissionGroups,
  listAdminRoles,
  listPermissionGroups,
} from "./access";
export { demoInventory, getInventory } from "./inventory";
export { demoAdminReviews, listAdminReviews } from "./reviews";
export {
  executeAdminAction,
  useAdminActionMutation,
  type AdminActionInput,
  type AdminActionResult,
} from "./mutations";

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
  useAdminPayments,
  useAdminPermissionGroups,
  useAdminPlatformVolume,
  useAdminReviews,
  useAdminRoles,
  useAdminWithdrawal,
  useAdminWithdrawals,
} from "./hooks";
