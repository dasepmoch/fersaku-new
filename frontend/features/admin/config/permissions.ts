/**
 * ADM-110 — FE mirror of backend authz.AllPermissionCodes.
 * Backend remains authority; FE only hides/disables existing controls.
 */

/** Canonical admin + shared permission codes (launch registry). */
export const ALL_PERMISSION_CODES = [
  "admin.ping",
  "admin.dashboard.read",
  "merchants.read",
  "merchants.write",
  "buyers.read",
  "orders.read",
  "payments.read",
  "kyc.review",
  "withdrawals.review",
  "impersonation.start",
  "impersonation.support_write",
  "provider_callbacks.replay",
  "seller_webhook_deliveries.retry",
  "webhooks.read",
  "roles.read",
  "roles.write",
  "roles.assign",
  "users.read",
  "fulfillment.force",
  "fulfillment.read",
  "inventory.reveal",
  "inventory.read",
  "reviews.read",
  "reviews.moderate",
  "campaigns.publish",
  "platform.emergency",
  "platform.fees.preview",
  "audit.read",
  "seller.store.read",
  "seller.store.write",
  "buyer.purchases.read",
  "invitations.staff",
  "invitations.merchant",
] as const;

export type PermissionCode = (typeof ALL_PERMISSION_CODES)[number];

const KNOWN = new Set<string>(ALL_PERMISSION_CODES);

/** Superuser wildcard from session claims (mock / SUPER_ADMIN bootstrap). */
export const PERMISSION_WILDCARD = "*";

export function isKnownPermissionCode(code: string): boolean {
  return KNOWN.has(code);
}

/**
 * Fail-closed permission check against session claim list.
 * Unknown codes never grant access (even with wildcard).
 */
export function claimsHavePermission(
  permissions: readonly string[] | null | undefined,
  code: string | null | undefined,
): boolean {
  if (!code) return false;
  if (!isKnownPermissionCode(code)) return false;
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes(PERMISSION_WILDCARD)) return true;
  return permissions.includes(code);
}

/**
 * Authenticated-admin surface gate (profile / subject-owned me routes).
 * No dedicated page permission code in BE registry.
 */
export function claimsAreAuthenticatedAdmin(claims: {
  subjectId?: string | null;
  surface?: string | null;
} | null | undefined): boolean {
  return Boolean(claims?.subjectId && claims.surface === "admin");
}

/** Action-level permission keys used by existing admin controls. */
export const ADMIN_ACTION_PERMISSIONS = {
  merchantsWrite: "merchants.write",
  rolesWrite: "roles.write",
  rolesAssign: "roles.assign",
  staffInvite: "roles.assign",
  auditExport: "audit.read",
  kycReview: "kyc.review",
  withdrawalsReview: "withdrawals.review",
  reviewsModerate: "reviews.moderate",
  inventoryReveal: "inventory.reveal",
  fulfillmentForce: "fulfillment.force",
  providerCallbacksReplay: "provider_callbacks.replay",
  sellerWebhookRetry: "seller_webhook_deliveries.retry",
  impersonationStart: "impersonation.start",
  platformEmergency: "platform.emergency",
  platformFeesPreview: "platform.fees.preview",
  campaignsPublish: "campaigns.publish",
} as const satisfies Record<string, PermissionCode>;

export type AdminActionPermissionKey = keyof typeof ADMIN_ACTION_PERMISSIONS;
