export type AdminPageMeta = {
  title: string;
  description: string;
  permission: string;
};

const adminPageMeta: Record<string, AdminPageMeta> = {
  overview: {
    title: "Command center",
    description:
      "Live platform health, QRIS payment volume, withdrawals, KYC, and operational queues.",
    permission: "admin.dashboard.read",
  },
  merchants: {
    title: "Merchant operations",
    description:
      "Review, verify, restrict, impersonate, and manage every store on the platform.",
    permission: "merchants.read",
  },
  buyers: {
    title: "Buyer identities",
    description:
      "Inspect verified buyer identities, purchases, magic-link sessions, and delivery access.",
    permission: "buyers.read",
  },
  users: {
    title: "Users & access",
    description:
      "Manage seller accounts, administrator roles, sessions, and security controls.",
    permission: "users.read",
  },
  profile: {
    title: "Administrator profile",
    description:
      "Manage your staff identity, MFA, trusted sessions, and personal notification preferences.",
    permission: "profile.read",
  },
  roles: {
    title: "Roles & permissions",
    description:
      "Create staff roles, define least-privilege access, and review permission assignments.",
    permission: "roles.read",
  },
  campaigns: {
    title: "Campaigns & announcements",
    description:
      "Publish emergency broadcasts, seller education, and compliance notices across email and in-app channels.",
    permission: "campaigns.read",
  },
  orders: {
    title: "Global orders",
    description:
      "Inspect every order, fulfillment, fee, and customer transaction.",
    permission: "orders.read",
  },
  payments: {
    title: "Payment operations",
    description:
      "Monitor QRIS intents, Xendit responses, callbacks, latency, and payment status.",
    permission: "payments.read",
  },
  withdrawals: {
    title: "Withdrawal control",
    description:
      "Review seller payouts, approve or reject requests, and monitor disbursement state.",
    permission: "withdrawals.read",
  },
  inventory: {
    title: "Global inventory",
    description:
      "Monitor structured credentials, stock codes, reservations, allocation integrity, and secret access.",
    permission: "inventory.read",
  },
  fulfillment: {
    title: "Fulfillment control",
    description:
      "Inspect, retry, revoke, and audit every file, link, credential, and stock delivery.",
    permission: "fulfillment.read",
  },
  reviews: {
    title: "Review moderation",
    description:
      "Moderate verified reviews, seller replies, abuse reports, and rating integrity.",
    permission: "reviews.read",
  },
  kyc: {
    title: "QRIS API KYC center",
    description:
      "Verify only merchants requesting production QRIS API access; ordinary storefront sellers remain exempt.",
    permission: "kyc.read",
  },
  webhooks: {
    title: "Webhook monitor",
    description:
      "Observe Xendit payment callbacks and seller webhook delivery across the platform.",
    permission: "webhooks.read",
  },
  "audit-logs": {
    title: "Immutable audit trail",
    description:
      "Search every sensitive platform and merchant action with complete actor context.",
    permission: "audit.read",
  },
  providers: {
    title: "Provider infrastructure",
    description:
      "Monitor Xendit, storage, queue, and email provider health with lightweight emergency controls.",
    permission: "providers.read",
  },
  system: {
    title: "Platform settings",
    description:
      "Review fixed launch fees and manage settlement, feature flags, limits, maintenance, and administrator policy.",
    permission: "system.read",
  },
};

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
