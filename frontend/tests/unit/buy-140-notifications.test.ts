import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notificationDataDtoSchema,
  notificationListEnvelopeSchema,
  unreadCountEnvelopeSchema,
  readAllEnvelopeSchema,
  notificationEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  filterNotificationsForSurface,
  formatNotificationTime,
  mapNotificationDataDto,
  mapNotificationListDto,
  sanitizeNotificationHref,
} from "@/shared/notifications/mappers";
import { clearDomainSourceSnapshot } from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { isPrivateQueryKey } from "@/shared/auth/private-cache";

const meta = {
  requestId: "req_buy140",
  timestamp: "2026-07-17T10:00:00Z",
  hasMore: false,
};

const buyerDto = {
  id: "ntf_buyer_1",
  eventCode: "PAYMENT_RECEIPT" as const,
  title: "Pembelian berhasil",
  body: "Canva Pro Team tersedia di koleksimu",
  ctaPath: "/account/purchases/FRS-1",
  contentVersion: "1",
  priority: "INFO" as const,
  surface: "BUYER" as const,
  createdAt: "2026-07-17T09:00:00Z",
  unread: true,
};

const sellerDto = {
  id: "ntf_seller_1",
  eventCode: "PAYMENT_RECEIPT" as const,
  title: "Pembayaran baru",
  body: "Nadia membeli AI Prompt Pack",
  ctaPath: "/dashboard/orders/FRS-1",
  contentVersion: "1",
  priority: "WARNING" as const,
  surface: "SELLER" as const,
  createdAt: "2026-07-17T09:58:00Z",
  unread: true,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_buy140",
    },
  });
}

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadApiMode(domainReturn: "api" | "mock" = "api") {
  vi.resetModules();
  const domain = await import("@/shared/data/domain-source");
  vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(
    domainReturn === "mock",
  );
  vi.spyOn(domain, "getDomainSource").mockReturnValue(domainReturn);
  return import("@/shared/notifications/api");
}

describe("BUY-140 notification schemas", () => {
  it("parses list / unread / mark-read / read-all envelopes", () => {
    expect(notificationDataDtoSchema.parse(buyerDto).id).toBe("ntf_buyer_1");
    expect(
      notificationListEnvelopeSchema.parse({
        data: [buyerDto, sellerDto],
        meta,
      }).data,
    ).toHaveLength(2);
    expect(
      unreadCountEnvelopeSchema.parse({
        data: { count: 3 },
        meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
      }).data.count,
    ).toBe(3);
    expect(
      notificationEnvelopeSchema.parse({
        data: { ...buyerDto, unread: false },
        meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
      }).data.unread,
    ).toBe(false);
    expect(
      readAllEnvelopeSchema.parse({
        data: { updated: 2 },
        meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
      }).data.updated,
    ).toBe(2);
  });
});

describe("BUY-140 mappers + CTA allowlist", () => {
  it("maps DTO to shell view and relative time", () => {
    const now = Date.parse("2026-07-17T10:00:00Z");
    const view = mapNotificationDataDto(sellerDto, "seller", now);
    expect(view.title).toBe("Pembayaran baru");
    expect(view.href).toBe("/dashboard/orders/FRS-1");
    expect(view.unread).toBe(true);
    expect(view.time).toBe("2 menit");
    expect(formatNotificationTime("2026-07-17T09:59:30Z", now)).toBe(
      "Baru saja",
    );
  });

  it("rejects malicious external CTA targets to surface home", () => {
    expect(sanitizeNotificationHref("https://evil.com", "buyer")).toBe(
      "/account/purchases",
    );
    expect(sanitizeNotificationHref("javascript:alert(1)", "seller")).toBe(
      "/dashboard",
    );
    expect(sanitizeNotificationHref("//evil.com", "admin")).toBe("/admin");
    expect(sanitizeNotificationHref("/admin/withdrawals", "buyer")).toBe(
      "/account/purchases",
    );
    expect(sanitizeNotificationHref("/dashboard/orders/1", "seller")).toBe(
      "/dashboard/orders/1",
    );
    expect(sanitizeNotificationHref("/account/purchases/x", "buyer")).toBe(
      "/account/purchases/x",
    );
  });

  it("filters cross-surface rows (isolation)", () => {
    const mixed = [buyerDto, sellerDto];
    expect(filterNotificationsForSurface(mixed, "buyer")).toEqual([buyerDto]);
    expect(filterNotificationsForSurface(mixed, "seller")).toEqual([sellerDto]);
    expect(filterNotificationsForSurface(mixed, "admin")).toEqual([]);
    const list = mapNotificationListDto(
      filterNotificationsForSurface(mixed, "buyer"),
      "buyer",
    );
    expect(list.items).toHaveLength(1);
    expect(list.unreadCount).toBe(1);
    expect(list.items[0]?.id).toBe("ntf_buyer_1");
  });
});

describe("BUY-140 query keys + private cache", () => {
  it("isolates surface and subject", () => {
    expect(queryKeys.notifications.list("buyer", "usr_a:ses_1")).toEqual([
      "notifications",
      "buyer",
      "usr_a:ses_1",
      "list",
    ]);
    expect(queryKeys.notifications.list("seller", "usr_a:ses_1")).toEqual([
      "notifications",
      "seller",
      "usr_a:ses_1",
      "list",
    ]);
    expect(queryKeys.notifications.list("buyer", "usr_b:ses_9")).not.toEqual(
      queryKeys.notifications.list("buyer", "usr_a:ses_1"),
    );
    expect(queryKeys.notifications.unreadCount("admin", "adm:1")).toEqual([
      "notifications",
      "admin",
      "adm:1",
      "unread-count",
    ]);
    expect(
      isPrivateQueryKey(queryKeys.notifications.list("buyer", "u:s")),
    ).toBe(true);
  });
});

describe("BUY-140 list + mark-read adapters", () => {
  it("mock path returns frozen fixtures per surface", async () => {
    const api = await loadApiMode("mock");
    const buyer = await api.listNotifications("buyer");
    const seller = await api.listNotifications("seller");
    expect(buyer.some((n) => n.id === "b1")).toBe(true);
    expect(seller.some((n) => n.id === "n1")).toBe(true);
    expect(buyer.every((n) => n.href.startsWith("/account"))).toBe(true);
    expect(seller.every((n) => n.href.startsWith("/dashboard"))).toBe(true);
    expect(await api.getUnreadNotificationCount("buyer")).toBeGreaterThan(0);
    const all = await api.markAllNotificationsRead("buyer");
    expect(all.updated).toBeGreaterThan(0);
  });

  it("api list uses surface alias and maps rows", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/buyer/notifications") && !url.includes("unread")) {
        return jsonResponse({
          data: [buyerDto, sellerDto],
          meta,
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode("api");
    const items = await api.listNotifications("buyer");
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("ntf_buyer_1");
    expect(items[0]?.href).toBe("/account/purchases/FRS-1");
    const called = String(fetchMock.mock.calls[0]?.[0]);
    expect(called).toContain("/v1/buyer/notifications");
    expect(called).toContain("limit=20");
  });

  it("api mark-read posts surface path", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/seller/notifications/ntf_seller_1/read")) {
          expect(init?.method).toBe("POST");
          return jsonResponse({
            data: {
              ...sellerDto,
              unread: false,
              readAt: "2026-07-17T10:01:00Z",
            },
            meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
          });
        }
        throw new Error(`unexpected ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode("api");
    const row = await api.markNotificationRead("seller", "ntf_seller_1");
    expect(row.unread).toBe(false);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/v1/seller/notifications/ntf_seller_1/read",
    );
  });

  it("api unread-count and read-all", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/unread-count")) {
          return jsonResponse({
            data: { count: 4 },
            meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
          });
        }
        if (url.includes("/read-all")) {
          expect(init?.method).toBe("POST");
          return jsonResponse({
            data: { updated: 4 },
            meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
          });
        }
        throw new Error(`unexpected ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadApiMode("api");
    expect(await api.getUnreadNotificationCount("admin")).toBe(4);
    expect((await api.markAllNotificationsRead("admin")).updated).toBe(4);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(
      urls.some((u) => u.includes("/v1/admin/notifications/unread-count")),
    ).toBe(true);
    expect(
      urls.some((u) => u.includes("/v1/admin/notifications/read-all")),
    ).toBe(true);
  });

  it("surface domain gates differ for buyer vs seller", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "getDomainSource").mockImplementation((d) =>
      d === "buyer" ? "api" : "mock",
    );
    const api = await import("@/shared/notifications/api");
    expect(api.isNotificationApiDomain("buyer")).toBe(true);
    expect(api.isNotificationApiDomain("seller")).toBe(false);
    expect(api.notificationDomainForSurface("admin")).toBe("adminRead");
  });
});
