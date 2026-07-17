import {
  claimsAreAuthenticatedAdmin,
  claimsHavePermission,
  isKnownPermissionCode,
  type PermissionCode,
} from "./permissions";

export type AdminRouteDisposition = "active" | "decision_pending";

export type AdminPageMeta = {
  title: string;
  description: string;
  /**
   * Minimum permission for the surface, or null when any authenticated admin
   * session may open the page (own profile / subject-owned me).
   */
  permission: PermissionCode | null;
  /**
   * decision_pending: surface stays unavailable (nav hidden, boundary denied)
   * until a later task defines route + permission (e.g. ADM-380 campaigns).
   */
  disposition: AdminRouteDisposition;
};

/**
 * Canonical FE↔BE route permission map (ADM-110 drift resolution):
 * - profile: authenticated admin only (no profile.read in BE registry)
 * - campaigns: decision_pending (campaigns.publish alone must not open list UI)
 * - withdrawals GET: withdrawals.review (combined read/review until separate read code)
 * - kyc GET: kyc.review (combined until separate kyc.read)
 * - providers: payments.read (GET /v1/admin/providers)
 * - system: platform.emergency (GET system/emergency; fees use platform.fees.preview on actions)
 */
const adminPageMeta: Record<string, AdminPageMeta> = {
  overview: {
    title: "Command center",
    description:
      "Live platform health, QRIS payment volume, withdrawals, KYC, and operational queues.",
    permission: "admin.dashboard.read",
    disposition: "active",
  },
  merchants: {
    title: "Merchant operations",
    description:
      "Review, verify, restrict, impersonate, and manage every store on the platform.",
    permission: "merchants.read",
    disposition: "active",
  },
  buyers: {
    title: "Buyer identities",
    description:
      "Inspect verified buyer identities, purchases, magic-link sessions, and delivery access.",
    permission: "buyers.read",
    disposition: "active",
  },
  users: {
    title: "Users & access",
    description:
      "Manage seller accounts, administrator roles, sessions, and security controls.",
    permission: "users.read",
    disposition: "active",
  },
  profile: {
    title: "Administrator profile",
    description:
      "Manage your staff identity, MFA, trusted sessions, and personal notification preferences.",
    permission: null,
    disposition: "active",
  },
  roles: {
    title: "Roles & permissions",
    description:
      "Create staff roles, define least-privilege access, and review permission assignments.",
    permission: "roles.read",
    disposition: "active",
  },
  campaigns: {
    title: "Campaigns & announcements",
    description:
      "Publish emergency broadcasts, seller education, and compliance notices across email and in-app channels.",
    permission: "campaigns.publish",
    disposition: "decision_pending",
  },
  orders: {
    title: "Global orders",
    description:
      "Inspect every order, fulfillment, fee, and customer transaction.",
    permission: "orders.read",
    disposition: "active",
  },
  payments: {
    title: "Payment operations",
    description:
      "Monitor QRIS intents, Xendit responses, callbacks, latency, and payment status.",
    permission: "payments.read",
    disposition: "active",
  },
  withdrawals: {
    title: "Withdrawal control",
    description:
      "Review seller payouts, approve or reject requests, and monitor disbursement state.",
    permission: "withdrawals.review",
    disposition: "active",
  },
  inventory: {
    title: "Global inventory",
    description:
      "Monitor structured credentials, stock codes, reservations, allocation integrity, and secret access.",
    permission: "inventory.read",
    disposition: "active",
  },
  fulfillment: {
    title: "Fulfillment control",
    description:
      "Inspect, retry, revoke, and audit every file, link, credential, and stock delivery.",
    permission: "fulfillment.read",
    disposition: "active",
  },
  reviews: {
    title: "Review moderation",
    description:
      "Moderate verified reviews, seller replies, abuse reports, and rating integrity.",
    permission: "reviews.read",
    disposition: "active",
  },
  kyc: {
    title: "QRIS API KYC center",
    description:
      "Verify only merchants requesting production QRIS API access; ordinary storefront sellers remain exempt.",
    permission: "kyc.review",
    disposition: "active",
  },
  webhooks: {
    title: "Webhook monitor",
    description:
      "Observe Xendit payment callbacks and seller webhook delivery across the platform.",
    permission: "webhooks.read",
    disposition: "active",
  },
  "audit-logs": {
    title: "Immutable audit trail",
    description:
      "Search every sensitive platform and merchant action with complete actor context.",
    permission: "audit.read",
    disposition: "active",
  },
  providers: {
    title: "Provider infrastructure",
    description:
      "Monitor Xendit, storage, queue, and email provider health with lightweight emergency controls.",
    permission: "payments.read",
    disposition: "active",
  },
  system: {
    title: "Platform settings",
    description:
      "Review fixed launch fees and manage settlement, feature flags, limits, maintenance, and administrator policy.",
    permission: "platform.emergency",
    disposition: "active",
  },
};

/** Nav href → section key used by getAdminPageMeta. */
export const ADMIN_NAV_ROUTE_KEYS: readonly {
  href: string;
  section: string;
  group?: "Money movement" | "Trust & operations" | "Infrastructure";
}[] = [
  { href: "/admin", section: "overview" },
  { href: "/admin/merchants", section: "merchants" },
  { href: "/admin/buyers", section: "buyers" },
  { href: "/admin/users", section: "users" },
  { href: "/admin/roles", section: "roles" },
  { href: "/admin/campaigns", section: "campaigns" },
  { href: "/admin/orders", section: "orders", group: "Money movement" },
  { href: "/admin/payments", section: "payments" },
  { href: "/admin/withdrawals", section: "withdrawals" },
  { href: "/admin/inventory", section: "inventory" },
  { href: "/admin/fulfillment", section: "fulfillment" },
  { href: "/admin/reviews", section: "reviews" },
  { href: "/admin/kyc", section: "kyc", group: "Trust & operations" },
  { href: "/admin/webhooks", section: "webhooks" },
  { href: "/admin/audit-logs", section: "audit-logs" },
  { href: "/admin/providers", section: "providers", group: "Infrastructure" },
  { href: "/admin/system", section: "system" },
] as const;

export function getAdminSegments(pathname: string) {
  return pathname
    .replace(/^\/admin\/?/, "")
    .split("/")
    .filter(Boolean);
}

export function getAdminPageMeta(segments: string[]): AdminPageMeta {
  const section = segments[0] || "overview";
  const base = adminPageMeta[section] || adminPageMeta.overview;
  return segments[1]
    ? { ...base, title: `${base.title} / ${segments[1]}` }
    : base;
}

export function listAdminPageMeta(): ReadonlyArray<{
  section: string;
  meta: AdminPageMeta;
}> {
  return Object.entries(adminPageMeta).map(([section, meta]) => ({
    section,
    meta,
  }));
}

export function canAccessAdminPage(
  meta: AdminPageMeta,
  claims: {
    subjectId?: string | null;
    surface?: string | null;
    permissions?: readonly string[] | null;
  } | null | undefined,
): boolean {
  if (meta.disposition === "decision_pending") return false;
  if (meta.permission === null) {
    return claimsAreAuthenticatedAdmin(claims);
  }
  if (!isKnownPermissionCode(meta.permission)) return false;
  return claimsHavePermission(claims?.permissions, meta.permission);
}

export function canAccessAdminNavHref(
  href: string,
  claims: {
    subjectId?: string | null;
    surface?: string | null;
    permissions?: readonly string[] | null;
  } | null | undefined,
): boolean {
  const entry = ADMIN_NAV_ROUTE_KEYS.find((item) => item.href === href);
  if (!entry) return false;
  return canAccessAdminPage(getAdminPageMeta([entry.section]), claims);
}
