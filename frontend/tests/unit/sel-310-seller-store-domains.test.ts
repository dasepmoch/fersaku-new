import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  storeDomainCreateRequestSchema,
  storeDomainDtoSchema,
  storeDomainEnvelopeSchema,
  storeDomainListEnvelopeSchema,
  storeDomainVerifyRequestSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import {
  assertNoDomainSecretsInView,
  isDomainConnected,
  mapDomainDetailLabel,
  mapDomainStatusLabel,
  mapStoreDomainDto,
  mapStoreDomainListDto,
  pickPrimaryDomain,
} from "@/features/seller/store-domains/mappers";
import { demoStoreDomains } from "@/features/seller/store-domains/mock";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/http-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/api/http-client")
  >("@/shared/api/http-client");
  return {
    ...actual,
    apiRequest: apiRequestMock,
  };
});

const meta = {
  requestId: "req_sel310",
  timestamp: "2026-07-17T10:00:00Z",
};

const activeDomain = {
  id: "dom_live_01",
  storeId: "store_live",
  merchantId: "mrc_live",
  hostname: "shop.merchant.example",
  hostnameNormalized: "shop.merchant.example",
  status: "ACTIVE" as const,
  tlsStatus: "ACTIVE" as const,
  version: 2,
  expectedDnsName: "_fersaku-challenge.shop.merchant.example",
  verifiedAt: "2026-07-10T00:00:00Z",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-10T00:00:00Z",
};

const pendingDomain = {
  ...activeDomain,
  id: "dom_live_02",
  hostname: "pending.merchant.example",
  hostnameNormalized: "pending.merchant.example",
  status: "PENDING_DNS" as const,
  tlsStatus: "NONE" as const,
  version: 1,
  expectedDnsName: "_fersaku-challenge.pending.merchant.example",
  verifiedAt: undefined,
};

const failedDomain = {
  ...activeDomain,
  id: "dom_live_03",
  hostname: "fail.merchant.example",
  hostnameNormalized: "fail.merchant.example",
  status: "FAILED" as const,
  tlsStatus: "NONE" as const,
  version: 1,
  failureCode: "DOMAIN_DNS_MISMATCH",
};

function installApiSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "api",
    }),
  );
}

function installMockSeller() {
  installDomainSourceSnapshot(
    evaluateDomainSources({
      stage: "prototype",
      bootstrapSource: "mock",
    }),
  );
}

describe("SEL-310 schemas", () => {
  it("accepts domain list without token hash", () => {
    expect(storeDomainDtoSchema.safeParse(activeDomain).success).toBe(true);
    const env = storeDomainListEnvelopeSchema.safeParse({
      data: [activeDomain, pendingDomain],
      meta,
    });
    expect(env.success).toBe(true);
    if (env.success) {
      const json = JSON.stringify(env.data);
      expect(json).not.toMatch(/verification_token_hash|verificationTokenHash/);
    }
  });

  it("create request requires hostname", () => {
    expect(
      storeDomainCreateRequestSchema.safeParse({
        hostname: "shop.example.com",
      }).success,
    ).toBe(true);
    expect(storeDomainCreateRequestSchema.safeParse({}).success).toBe(false);
  });

  it("create envelope may include one-time verificationToken", () => {
    const env = storeDomainEnvelopeSchema.safeParse({
      data: {
        ...pendingDomain,
        verificationToken: "tok_once_display",
      },
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("verify request requires verificationToken", () => {
    expect(
      storeDomainVerifyRequestSchema.safeParse({
        verificationToken: "tok_abc",
        expectedVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      storeDomainVerifyRequestSchema.safeParse({ expectedVersion: 1 }).success,
    ).toBe(false);
  });
});

describe("SEL-310 mappers", () => {
  it("maps status labels for existing chip", () => {
    expect(mapDomainStatusLabel("ACTIVE", "ACTIVE")).toBe("Connected");
    expect(mapDomainStatusLabel("ACTIVE", "PENDING")).toBe("TLS pending");
    expect(mapDomainStatusLabel("PENDING_DNS", "NONE")).toBe("Pending DNS");
    expect(mapDomainStatusLabel("FAILED", "NONE")).toBe("Failed");
    expect(mapDomainStatusLabel("SUSPENDED", "ACTIVE")).toBe("Suspended");
  });

  it("connected only when ACTIVE + TLS ACTIVE", () => {
    expect(isDomainConnected("ACTIVE", "ACTIVE")).toBe(true);
    expect(isDomainConnected("ACTIVE", "PENDING")).toBe(false);
    expect(isDomainConnected("PENDING_DNS", "NONE")).toBe(false);
  });

  it("maps domain DTO without carrying token", () => {
    const view = mapStoreDomainDto(activeDomain);
    expect(view.hostname).toBe("shop.merchant.example");
    expect(view.statusLabel).toBe("Connected");
    expect(view.connected).toBe(true);
    expect(view.detailLabel).toMatch(/DNS verified/);
    expect(view).not.toHaveProperty("verificationToken");
    assertNoDomainSecretsInView(view);
  });

  it("maps pending DNS detail with expectedDnsName", () => {
    const view = mapStoreDomainDto(pendingDomain);
    expect(view.statusLabel).toBe("Pending DNS");
    expect(view.connected).toBe(false);
    expect(view.detailLabel).toContain("_fersaku-challenge");
  });

  it("maps failureCode into detail", () => {
    const view = mapStoreDomainDto(failedDomain);
    expect(view.statusLabel).toBe("Failed");
    expect(view.detailLabel).toBe("DOMAIN_DNS_MISMATCH");
  });

  it("rejects token hash leakage", () => {
    expect(() =>
      mapStoreDomainDto({
        ...activeDomain,
        verificationTokenHash: "deadbeef",
      } as typeof activeDomain & { verificationTokenHash: string }),
    ).toThrow();
  });

  it("filters tombstoned from list; pickPrimary prefers connected", () => {
    const list = mapStoreDomainListDto([
      pendingDomain,
      activeDomain,
      { ...activeDomain, id: "dom_dead", status: "TOMBSTONED" },
    ]);
    expect(list.every((d) => d.status !== "TOMBSTONED")).toBe(true);
    expect(pickPrimaryDomain(list)?.id).toBe("dom_live_01");
    expect(pickPrimaryDomain([mapStoreDomainDto(pendingDomain)])?.id).toBe(
      "dom_live_02",
    );
  });

  it("detail helpers stay display-only", () => {
    expect(
      mapDomainDetailLabel({
        status: "ACTIVE",
        tlsStatus: "ACTIVE",
        hostname: "x.com",
      }),
    ).toBe("DNS verified · TLS active");
    expect(
      mapDomainDetailLabel({
        status: "PENDING_DNS",
        tlsStatus: "NONE",
        expectedDnsName: "_fersaku-challenge.x.com",
        hostname: "x.com",
      }),
    ).toContain("_fersaku-challenge");
  });
});

describe("SEL-310 query keys", () => {
  it("includes store id; never token material", () => {
    expect(queryKeys.seller.domains("store_a")).toEqual([
      "seller",
      "store_a",
      "domains",
    ]);
    expect(queryKeys.seller.domain("store_a", "dom_1")).toEqual([
      "seller",
      "store_a",
      "domains",
      "dom_1",
    ]);
    expect(queryKeys.seller.domains("store_a")).not.toEqual(
      queryKeys.seller.domains("store_b"),
    );
    const keyJson = JSON.stringify(queryKeys.seller.domains("store_a"));
    expect(keyJson).not.toMatch(/token|secret|verify/i);
  });
});

describe("SEL-310 api adapters", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("mock path returns fixtures without network", async () => {
    installMockSeller();
    const {
      listStoreDomains,
      createStoreDomain,
      verifyStoreDomain,
      deleteStoreDomain,
    } = await import("@/features/seller/store-domains/api");

    const list = await listStoreDomains("store_demo");
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(list[0]?.hostname).toBe("shop.asep.ai");
    expect(list[0]?.connected).toBe(true);

    const created = await createStoreDomain("store_demo", {
      hostname: "new.example.com",
    });
    expect(created.verificationToken).toBeTruthy();
    expect(created.domain.status).toBe("PENDING_DNS");
    expect(created.domain).not.toHaveProperty("verificationToken");

    const verified = await verifyStoreDomain("store_demo", {
      domainId: "dom_demo_01",
      verificationToken: "x",
    });
    expect(verified.connected).toBe(true);

    const deleted = await deleteStoreDomain("store_demo", {
      domainId: "dom_demo_01",
    });
    expect(deleted.status).toBe("TOMBSTONED");
  });

  it("api list maps array envelope", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [activeDomain, pendingDomain],
      meta,
    });
    const { listStoreDomains } = await import(
      "@/features/seller/store-domains/api"
    );
    const list = await listStoreDomains("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/domains",
      expect.objectContaining({
        schema: storeDomainListEnvelopeSchema,
      }),
    );
    expect(list).toHaveLength(2);
    expect(list[0]?.connected).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/verificationToken/);
  });

  it("api create strips token from domain view; returns token once", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        ...pendingDomain,
        verificationToken: "tok_create_once",
      },
      meta,
    });
    const { createStoreDomain } = await import(
      "@/features/seller/store-domains/api"
    );
    const result = await createStoreDomain("store_live", {
      hostname: "pending.merchant.example",
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/domains",
      expect.objectContaining({
        method: "POST",
        body: { hostname: "pending.merchant.example" },
      }),
    );
    expect(result.verificationToken).toBe("tok_create_once");
    expect(result.domain).not.toHaveProperty("verificationToken");
    expect(result.domain.status).toBe("PENDING_DNS");
  });

  it("api verify posts token + optional version", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: activeDomain,
      meta,
    });
    const { verifyStoreDomain } = await import(
      "@/features/seller/store-domains/api"
    );
    const domain = await verifyStoreDomain("store_live", {
      domainId: "dom_live_02",
      verificationToken: "tok_abc",
      expectedVersion: 1,
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/domains/dom_live_02/verify",
      expect.objectContaining({
        method: "POST",
        body: {
          verificationToken: "tok_abc",
          expectedVersion: 1,
        },
      }),
    );
    expect(domain.connected).toBe(true);
  });

  it("api delete sends expectedVersion when provided", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        ...activeDomain,
        status: "TOMBSTONED",
        tlsStatus: "REMOVED",
      },
      meta,
    });
    const { deleteStoreDomain } = await import(
      "@/features/seller/store-domains/api"
    );
    await deleteStoreDomain("store_live", {
      domainId: "dom_live_01",
      expectedVersion: 2,
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/domains/dom_live_01",
      expect.objectContaining({
        method: "DELETE",
        body: { expectedVersion: 2 },
      }),
    );
  });

  it("demo fixture matches snapshot host shop.asep.ai", () => {
    const demo = demoStoreDomains("demo");
    expect(demo[0]?.hostname).toBe("shop.asep.ai");
    expect(demo[0]?.statusLabel).toBe("Connected");
  });
});

describe("SEL-310 disposition", () => {
  it("API domain gate is sellerOperations", async () => {
    installMockSeller();
    const { isSellerStoreDomainsApiDomain } = await import(
      "@/features/seller/store-domains/api"
    );
    expect(isSellerStoreDomainsApiDomain()).toBe(false);
    installApiSeller();
    expect(isSellerStoreDomainsApiDomain()).toBe(true);
  });

  it("does not invent Connected when no domain on API path mapper", () => {
    expect(pickPrimaryDomain([])).toBeUndefined();
    const pending = mapStoreDomainDto(pendingDomain);
    expect(pending.connected).toBe(false);
    expect(pending.statusLabel).not.toBe("Connected");
  });
});
