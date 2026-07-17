import { describe, expect, it } from "vitest";
import { queryKeys } from "@/shared/query/query-keys";
import { DEMO_STORE_ID } from "@/shared/config/demo";

describe("queryKeys", () => {
  it("builds seller domain keys", () => {
    expect(queryKeys.seller.finance(DEMO_STORE_ID)).toEqual([
      "seller",
      DEMO_STORE_ID,
      "finance",
    ]);
    expect(queryKeys.seller.customers(DEMO_STORE_ID)).toEqual([
      "seller",
      DEMO_STORE_ID,
      "customers",
      {},
    ]);
    expect(queryKeys.seller.customer(DEMO_STORE_ID, "cust_1")).toEqual([
      "seller",
      DEMO_STORE_ID,
      "customers",
      "cust_1",
    ]);
    expect(queryKeys.seller.reviews(DEMO_STORE_ID)).toEqual([
      "seller",
      DEMO_STORE_ID,
      "reviews",
    ]);
    expect(queryKeys.seller.storefront(DEMO_STORE_ID)).toEqual([
      "seller",
      DEMO_STORE_ID,
      "storefront",
    ]);
    expect(queryKeys.seller.apiKeys(DEMO_STORE_ID)).toEqual([
      "seller",
      DEMO_STORE_ID,
      "api-keys",
    ]);
    expect(queryKeys.seller.webhooks(DEMO_STORE_ID)).toEqual([
      "seller",
      DEMO_STORE_ID,
      "webhooks",
    ]);
    expect(queryKeys.seller.coupons(DEMO_STORE_ID)).toEqual([
      "seller",
      DEMO_STORE_ID,
      "coupons",
    ]);
  });

  it("builds admin domain keys with bounded list profile", () => {
    // ADM-120: list keys include "bounded" profile segment for filter isolation.
    expect(queryKeys.admin.merchants()).toEqual([
      "admin",
      "merchants",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.merchant("str_01")).toEqual([
      "admin",
      "merchants",
      "str_01",
    ]);
    expect(queryKeys.admin.buyers()).toEqual([
      "admin",
      "buyers",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.buyer("byr_01")).toEqual([
      "admin",
      "buyers",
      "byr_01",
    ]);
    expect(queryKeys.admin.orders()).toEqual([
      "admin",
      "orders",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.order("FRS-1")).toEqual([
      "admin",
      "orders",
      "FRS-1",
    ]);
    expect(queryKeys.admin.withdrawals()).toEqual([
      "admin",
      "withdrawals",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.withdrawal("WD-1")).toEqual([
      "admin",
      "withdrawals",
      "WD-1",
    ]);
    expect(queryKeys.admin.payments()).toEqual([
      "admin",
      "payments",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.kyc()).toEqual(["admin", "kyc", "bounded", {}]);
    expect(queryKeys.admin.webhooks()).toEqual([
      "admin",
      "webhooks",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.roles()).toEqual(["admin", "roles"]);
    expect(queryKeys.admin.users()).toEqual([
      "admin",
      "users",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.campaigns()).toEqual([
      "admin",
      "campaigns",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.providers()).toEqual(["admin", "providers"]);
    expect(queryKeys.admin.inventory()).toEqual([
      "admin",
      "inventory",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.fulfillment()).toEqual([
      "admin",
      "fulfillment",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.reviews()).toEqual([
      "admin",
      "reviews",
      "bounded",
      {},
    ]);
    expect(queryKeys.admin.system()).toEqual(["admin", "system"]);
    expect(queryKeys.admin.auditLogs()).toEqual([
      "admin",
      "audit-logs",
      "bounded",
      {},
    ]);
  });

  it("builds buyer domain keys with subject boundary + filters", () => {
    expect(queryKeys.buyer.purchases("usr_a:ses_1", { q: "", filter: "Semua" })).toEqual([
      "buyer",
      "usr_a:ses_1",
      "purchases",
      "bounded",
      { q: "", filter: "Semua" },
    ]);
    expect(queryKeys.buyer.purchase("usr_a:ses_1", "FRS-1")).toEqual([
      "buyer",
      "usr_a:ses_1",
      "purchases",
      "FRS-1",
    ]);
    expect(queryKeys.buyer.profile("usr_a:ses_1")).toEqual([
      "buyer",
      "usr_a:ses_1",
      "profile",
    ]);
    expect(queryKeys.buyer.profile("usr_b:ses_9")).toEqual([
      "buyer",
      "usr_b:ses_9",
      "profile",
    ]);
    expect(queryKeys.buyer.notificationPreferences("usr_a:ses_1")).toEqual([
      "buyer",
      "usr_a:ses_1",
      "notification-preferences",
    ]);
    expect(queryKeys.buyer.sessions("usr_a:ses_1")).toEqual([
      "buyer",
      "usr_a:ses_1",
      "sessions",
    ]);
    expect(queryKeys.buyer.sessions("usr_b:ses_9")).toEqual([
      "buyer",
      "usr_b:ses_9",
      "sessions",
    ]);
    expect(queryKeys.buyer.review("usr_a:ses_1", "oi_1")).toEqual([
      "buyer",
      "usr_a:ses_1",
      "reviews",
      "oi_1",
    ]);
    expect(queryKeys.public.productReviews("prod_01")).toEqual([
      "public",
      "products",
      "prod_01",
      "reviews",
    ]);
    expect(queryKeys.public.productReviewSummary("prod_01")).toEqual([
      "public",
      "products",
      "prod_01",
      "reviews",
      "summary",
    ]);
  });

  it("builds shared notification keys with surface + subject isolation", () => {
    expect(queryKeys.notifications.list("buyer", "usr_a:ses_1")).toEqual([
      "notifications",
      "buyer",
      "usr_a:ses_1",
      "list",
    ]);
    expect(queryKeys.notifications.unreadCount("seller", "usr_a:ses_1")).toEqual(
      ["notifications", "seller", "usr_a:ses_1", "unread-count"],
    );
    expect(queryKeys.notifications.list("buyer", "usr_a:ses_1")).not.toEqual(
      queryKeys.notifications.list("seller", "usr_a:ses_1"),
    );
  });
});
