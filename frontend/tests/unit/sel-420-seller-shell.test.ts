import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clearPrivateQueryCache,
  isPrivateQueryKey,
} from "@/shared/auth/private-cache";
import { queryKeys } from "@/shared/query/query-keys";
import { clearDomainSourceSnapshot } from "@/shared/data/domain-source";

const meta = {
  requestId: "req_sel420",
  timestamp: "2026-07-17T10:00:00Z",
  hasMore: false,
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_sel420",
    },
  });
}

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadNotificationApi(domainReturn: "api" | "mock" = "api") {
  vi.resetModules();
  const domain = await import("@/shared/data/domain-source");
  vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(
    domainReturn === "mock",
  );
  vi.spyOn(domain, "getDomainSource").mockReturnValue(domainReturn);
  return import("@/shared/notifications/api");
}

describe("SEL-420 seller shell wiring disposition", () => {
  it("dashboard shell reuses shared NotificationCenter + ProfileMenu with seller surface", () => {
    const root = process.cwd();
    const source = readFileSync(
      path.join(root, "features/seller/components/dashboard-shell.tsx"),
      "utf8",
    );
    expect(source).toMatch(/from ["']@\/shared\/ui\/account-controls["']/);
    expect(source).toMatch(/NotificationCenter\s+surface=["']seller["']/);
    expect(source).toMatch(/ProfileMenu\s+surface=["']seller["']/);
    // No second notification adapter in seller feature tree.
    expect(source).not.toMatch(
      /features\/seller\/notifications|sellerNotificationsAdapter/,
    );
    // Session + current-store bound chrome (not hardcoded mock identity on API path).
    expect(source).toMatch(/useSession|useCurrentStore/);
    expect(source).toMatch(/sellerStoreChrome|storeChrome/);
  });

  it("does not invent a seller-only notification module", () => {
    const root = process.cwd();
    const source = readFileSync(
      path.join(root, "features/seller/components/dashboard-shell.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/demoNotifications\s*\(\s*["']seller["']/);
    expect(source).toMatch(/@\/shared\/ui\/account-controls/);
  });
});

describe("SEL-420 seller notification alias + isolation", () => {
  it("seller list uses /v1/seller/notifications and drops buyer rows", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/seller/notifications") && !url.includes("unread")) {
        return jsonResponse({
          data: [sellerDto, buyerDto],
          meta,
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadNotificationApi("api");
    const items = await api.listNotifications("seller");
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("ntf_seller_1");
    expect(items[0]?.href).toBe("/dashboard/orders/FRS-1");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/v1/seller/notifications",
    );
  });

  it("seller mark-read and read-all hit seller alias", async () => {
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
        if (url.includes("/v1/seller/notifications/read-all")) {
          expect(init?.method).toBe("POST");
          return jsonResponse({
            data: { updated: 2 },
            meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
          });
        }
        throw new Error(`unexpected ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadNotificationApi("api");
    const row = await api.markNotificationRead("seller", "ntf_seller_1");
    expect(row.unread).toBe(false);
    expect((await api.markAllNotificationsRead("seller")).updated).toBe(2);
  });

  it("query keys isolate seller surface + subject; notifications are private", () => {
    const sellerA = queryKeys.notifications.list("seller", "usr_a:ses_1");
    const sellerB = queryKeys.notifications.list("seller", "usr_b:ses_9");
    const buyerA = queryKeys.notifications.list("buyer", "usr_a:ses_1");
    expect(sellerA).toEqual(["notifications", "seller", "usr_a:ses_1", "list"]);
    expect(sellerA).not.toEqual(sellerB);
    expect(sellerA).not.toEqual(buyerA);
    expect(isPrivateQueryKey(sellerA)).toBe(true);
    expect(
      isPrivateQueryKey(queryKeys.notifications.unreadCount("seller", "u:s")),
    ).toBe(true);
  });
});

describe("SEL-420 logout clears private cache including notifications", () => {
  it("clearPrivateQueryCache removes seller + notifications roots", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.notifications.list("seller", "usr_s:ses_s"), [
      { id: "n1" },
    ]);
    client.setQueryData(
      queryKeys.notifications.unreadCount("seller", "usr_s:ses_s"),
      3,
    );
    client.setQueryData(["seller", "store_1", "products"], { ok: true });
    client.setQueryData(["public", "catalog"], { ok: true });
    client.setQueryData(["theme"], "light");

    clearPrivateQueryCache(client);

    expect(
      client.getQueryData(
        queryKeys.notifications.list("seller", "usr_s:ses_s"),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(
        queryKeys.notifications.unreadCount("seller", "usr_s:ses_s"),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(["seller", "store_1", "products"]),
    ).toBeUndefined();
    expect(client.getQueryData(["public", "catalog"])).toEqual({ ok: true });
    expect(client.getQueryData(["theme"])).toBe("light");
  });

  it("logoutSession seller surface revokes, clears cache, returns /login", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "getDomainSource").mockImplementation((d) =>
      d === "auth" ? "api" : "mock",
    );

    const {
      __resetSessionStoreForTests,
      bindSessionQueryClient,
      bootstrapSession,
      logoutSession,
      getSessionSnapshot,
    } = await import("@/shared/auth/session-store");
    const { getCsrfToken } = await import("@/shared/api/csrf");

    __resetSessionStoreForTests();
    const client = new QueryClient();
    bindSessionQueryClient(client);
    client.setQueryData(queryKeys.notifications.list("seller", "usr_s:ses_s"), [
      { id: "n1" },
    ]);
    client.setQueryData(["seller", "store_1", "orders"], { ok: true });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.includes("/v1/auth/session") &&
          (!init?.method || init.method === "GET")
        ) {
          return jsonResponse({
            data: {
              userId: "usr_s",
              sessionId: "ses_s",
              surface: "SELLER",
              csrfToken: "csrf_sel420",
              permissions: [],
              roles: [],
            },
            meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
          });
        }
        if (url.includes("/v1/auth/logout")) {
          return jsonResponse({
            data: { message: "Logged out" },
            meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
          });
        }
        return new Response(JSON.stringify({ title: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        });
      }),
    );

    await bootstrapSession();
    expect(getSessionSnapshot().claims?.surface).toBe("seller");
    expect(getCsrfToken()).toBe("csrf_sel420");

    const { loginHref } = await logoutSession({
      surface: "seller",
      redirect: false,
    });
    expect(loginHref).toBe("/login");
    expect(getSessionSnapshot().status).toBe("anonymous");
    expect(getCsrfToken()).toBeUndefined();
    expect(
      client.getQueryData(
        queryKeys.notifications.list("seller", "usr_s:ses_s"),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(["seller", "store_1", "orders"]),
    ).toBeUndefined();

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => String(c[0]).includes("/v1/auth/logout"))).toBe(
      true,
    );
  });
});
