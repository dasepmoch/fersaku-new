import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminBuyerDtoSchema,
  adminBuyerPurchaseDtoSchema,
  adminBuyerSessionDtoSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  assertNoSecretsInAdminBuyerProjection,
  demoBuyerPurchases,
  demoBuyerSessions,
  getBuyer,
  listBuyerPurchases,
  listBuyerSessions,
  listBuyers,
  listBuyersPage,
  mapAdminBuyerDto,
  mapAdminBuyerPurchaseDto,
  mapAdminBuyerSessionDto,
} from "@/features/admin/data";
import { queryKeys } from "@/shared/query/query-keys";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api/http-client")>(
    "@/shared/api/http-client",
  );
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

function installApiAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockAdmin() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

const AS_OF = "2026-07-17T11:00:00Z";

const sampleBuyer = {
  id: "byr_live",
  name: "Live Buyer",
  email: "live@example.id",
  verified: "Verified",
  purchases: 3,
  spent: 250_000,
  sessions: 2,
  last: "Now",
};

const samplePurchase = {
  orderId: "FRS-240712-1842",
  product: "AI Prompt Pack",
  seller: "Asep AI Tools",
  status: "Paid",
};

const sampleSession = {
  id: "ses_1",
  device: "Chrome",
  location: "Jakarta",
  ip: "hash:abc",
  active: "Now",
  current: false,
};

describe("ADM-210 admin buyer support surface", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps buyer list/detail DTO with server money authority", () => {
    const view = mapAdminBuyerDto(
      adminBuyerDtoSchema.parse({
        ...sampleBuyer,
        spent: 1_250_500,
      }),
    );
    expect(view.spent).toBe(1_250_500);
    expect(view.purchases).toBe(3);
    expect(view.email).toBe("live@example.id");
  });

  it("maps purchase shell without delivery secrets", () => {
    const dto = adminBuyerPurchaseDtoSchema.parse({
      ...samplePurchase,
      password: "Fersaku#4821",
      code: { value: "A8K2L-SECRET" },
      credentialFields: [{ label: "Password", value: "x", secret: true }],
      deliverySecret: "del-secret",
    });
    const view = mapAdminBuyerPurchaseDto(dto);
    expect(view).toEqual({
      orderId: "FRS-240712-1842",
      product: "AI Prompt Pack",
      seller: "Asep AI Tools",
      status: "Paid",
    });
    expect(JSON.stringify(view)).not.toMatch(/password|secret|credential|A8K2L/i);
    assertNoSecretsInAdminBuyerProjection(view);
  });

  it("maps session metadata only", () => {
    const view = mapAdminBuyerSessionDto(
      adminBuyerSessionDtoSchema.parse(sampleSession),
    );
    expect(view.id).toBe("ses_1");
    expect(view.current).toBe(false);
    expect(view).not.toHaveProperty("token");
  });

  it("permission deny: buyers.read required for list; merchants.write for support actions", () => {
    expect(claimsHavePermission(["orders.read"], "buyers.read")).toBe(false);
    expect(claimsHavePermission(["buyers.read"], "buyers.read")).toBe(true);
    expect(claimsHavePermission(["buyers.read"], "merchants.write")).toBe(
      false,
    );
    expect(claimsHavePermission(["merchants.write"], "merchants.write")).toBe(
      true,
    );
    expect(claimsHavePermission(null, "buyers.read")).toBe(false);
    expect(claimsHavePermission(["*"], "buyers.read")).toBe(true);
  });

  it("mock path never hits transport for list/detail/purchases/sessions", async () => {
    installMockAdmin();
    const list = await listBuyers();
    const page = await listBuyersPage({ limit: 2 });
    const detail = await getBuyer(list[0]!.id);
    const purchases = await listBuyerPurchases(list[0]!.id);
    const sessions = await listBuyerSessions(list[0]!.id);
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(list.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(detail?.id).toBe(list[0]!.id);
    expect(purchases.length).toBeGreaterThan(0);
    assertNoSecretsInAdminBuyerProjection(purchases);
    assertNoSecretsInAdminBuyerProjection(demoBuyerPurchases());
    expect(sessions.length).toBeGreaterThan(0);
    expect(JSON.stringify(purchases)).not.toMatch(
      /Fersaku#|A8K2L|password|credentialFields/i,
    );
  });

  it("API buyer list uses bounded path and maps spent", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [sampleBuyer],
      meta: { requestId: "req_list", timestamp: AS_OF, hasMore: false },
    });
    const rows = await listBuyers({ q: "Live", limit: 50 });
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/buyers");
    expect(apiRequestMock.mock.calls[0]![1].query).toMatchObject({
      q: "Live",
      limit: 50,
    });
    expect(rows[0]?.spent).toBe(250_000);
    expect(rows[0]?.name).toBe("Live Buyer");
  });

  it("API buyer detail uses typed get path", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: sampleBuyer,
      meta: { requestId: "req_d", timestamp: AS_OF },
    });
    const b = await getBuyer("byr_live");
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/buyers/byr_live");
    expect(b?.email).toBe("live@example.id");
  });

  it("API purchases path maps shell only and rejects secret material in view", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [samplePurchase],
      meta: { requestId: "req_p", timestamp: AS_OF, hasMore: false },
    });
    const rows = await listBuyerPurchases("byr_live");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/buyers/byr_live/purchases",
    );
    expect(rows[0]).toEqual(samplePurchase);
    assertNoSecretsInAdminBuyerProjection(rows);
  });

  it("API sessions path uses buyer-scoped sessions endpoint", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [sampleSession],
      meta: { requestId: "req_s", timestamp: AS_OF, hasMore: false },
    });
    const rows = await listBuyerSessions("byr_live");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/buyers/byr_live/sessions",
    );
    expect(rows[0]?.id).toBe("ses_1");
    expect(JSON.stringify(rows)).not.toMatch(/token|magic/i);
  });

  it("assertNoSecrets throws when secret material present", () => {
    expect(() =>
      assertNoSecretsInAdminBuyerProjection({
        orderId: "x",
        password: "secret",
      }),
    ).toThrow(/secret material/i);
    expect(() =>
      assertNoSecretsInAdminBuyerProjection({
        rawKey: "fsk_live_abc",
      }),
    ).toThrow();
  });

  it("query keys isolate buyer detail, purchases, sessions", () => {
    expect(queryKeys.admin.buyer("b1")).toEqual(["admin", "buyers", "b1"]);
    expect(queryKeys.admin.buyerPurchases("b1")).toEqual([
      "admin",
      "buyers",
      "b1",
      "purchases",
    ]);
    expect(queryKeys.admin.buyerSessions("b1")).toEqual([
      "admin",
      "buyers",
      "b1",
      "sessions",
    ]);
    expect(queryKeys.admin.buyers({ q: "a" })).not.toEqual(
      queryKeys.admin.buyers({ q: "b" }),
    );
  });

  it("mock purchase fixtures never include buyer delivery secrets", () => {
    const purchases = demoBuyerPurchases();
    const sessions = demoBuyerSessions();
    assertNoSecretsInAdminBuyerProjection(purchases);
    assertNoSecretsInAdminBuyerProjection(sessions);
    expect(JSON.stringify(purchases)).not.toMatch(
      /Fersaku#|buyer\.workspace@|A8K2L-9QM4X/i,
    );
  });
});
