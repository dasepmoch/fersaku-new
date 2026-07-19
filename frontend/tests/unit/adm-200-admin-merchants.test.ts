import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminMerchantDtoSchema,
  adminMerchantFinanceSummaryDataSchema,
  adminCredentialAuthorizeDataSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  authorizeMerchantCredential,
  getMerchant,
  getMerchantFinanceSummary,
  listMerchants,
  listMerchantsPage,
  listMerchantCredentials,
  updateMerchantApiAccess,
  updateMerchantStatus,
} from "@/features/admin/data";
import {
  humanizeMerchantApiAccess,
  humanizeMerchantStatus,
  mapAdminMerchantDto,
  mapAdminMerchantFinanceSummaryDto,
  nextMerchantApiAccessDisplay,
  nextMerchantStatusDisplay,
  toMerchantApiAccessWire,
  toMerchantStatusWire,
} from "@/features/admin/data/mappers";
import { queryKeys } from "@/shared/query/query-keys";

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

const AS_OF = "2026-07-17T10:00:00Z";

const sampleMerchant = {
  id: "m_live",
  name: "Live Store",
  owner: "Owner",
  email: "o@x.id",
  volume: 9_999_000,
  orders: 12,
  risk: "Low",
  status: "Active",
  joined: "1 Jan 2026",
  apiAccess: "Enabled",
};

describe("ADM-200 admin merchants list/detail/commands", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps merchant list DTO with independent status and apiAccess axes", () => {
    const view = mapAdminMerchantDto(
      adminMerchantDtoSchema.parse({
        ...sampleMerchant,
        status: "Suspended",
        apiAccess: "Enabled",
      }),
    );
    expect(view.status).toBe("Suspended");
    expect(view.apiAccess).toBe("Enabled");
    expect(view.volume).toBe(9_999_000);
  });

  it("maps display ↔ wire status without coupling API capability", () => {
    expect(toMerchantStatusWire("Active")).toBe("ACTIVE");
    expect(toMerchantStatusWire("Suspended")).toBe("SUSPENDED");
    expect(toMerchantStatusWire("Restricted")).toBe("SUSPENDED");
    expect(toMerchantStatusWire("Closed")).toBe("CLOSED");
    expect(toMerchantApiAccessWire("Enabled")).toBe("ACTIVE");
    expect(toMerchantApiAccessWire("Suspended")).toBe("SUSPENDED");
    expect(toMerchantApiAccessWire("Pending KYC")).toBeNull();
    expect(toMerchantApiAccessWire("Not requested")).toBeNull();
    expect(humanizeMerchantStatus("ACTIVE")).toBe("Active");
    expect(humanizeMerchantApiAccess("ACTIVE")).toBe("Enabled");
    expect(nextMerchantStatusDisplay("Active")).toBe("Suspended");
    expect(nextMerchantStatusDisplay("Suspended")).toBe("Active");
    expect(nextMerchantApiAccessDisplay("Enabled")).toBe("Suspended");
    expect(nextMerchantApiAccessDisplay("Suspended")).toBe("Enabled");
  });

  it("maps finance summary money from server only", () => {
    const dto = adminMerchantFinanceSummaryDataSchema.parse({
      merchantId: "m1",
      availableAmount: 1_000_000,
      pendingAmount: 50_000,
      heldAmount: 10_000,
      lifetimeGrossAmount: 5_000_000,
      lifetimeNetAmount: 4_800_000,
      currency: "IDR",
      asOf: AS_OF,
    });
    const view = mapAdminMerchantFinanceSummaryDto(dto, AS_OF);
    expect(view.availableAmount).toBe(1_000_000);
    expect(view.lifetimeGrossAmount).toBe(5_000_000);
    expect(view.asOf).toBe(AS_OF);
  });

  it("permission deny: merchants.read required for list; merchants.write for mutations", () => {
    expect(claimsHavePermission(["orders.read"], "merchants.read")).toBe(false);
    expect(claimsHavePermission(["merchants.read"], "merchants.write")).toBe(
      false,
    );
    expect(claimsHavePermission(["merchants.write"], "merchants.write")).toBe(
      true,
    );
    expect(claimsHavePermission(["kyc.review"], "merchants.write")).toBe(false);
    expect(claimsHavePermission(null, "merchants.read")).toBe(false);
    expect(claimsHavePermission(["*"], "merchants.read")).toBe(true);
  });

  it("mock path never hits transport for list/detail/commands", async () => {
    installMockAdmin();
    const list = await listMerchants();
    const page = await listMerchantsPage({ limit: 2 });
    const detail = await getMerchant(list[0]!.id);
    const finance = await getMerchantFinanceSummary(list[0]!.id);
    const creds = await listMerchantCredentials(list[0]!.id);
    const status = await updateMerchantStatus({
      merchantId: list[0]!.id,
      status: "SUSPENDED",
      reason: "Support ticket review for suspension",
    });
    const api = await updateMerchantApiAccess({
      merchantId: list[0]!.id,
      status: "SUSPENDED",
      reason: "Support ticket review for API hold",
    });
    const rotate = await authorizeMerchantCredential({
      merchantId: list[0]!.id,
      reason: "Support ticket review for key rotate",
      mode: "rotate",
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(list.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(detail?.id).toBe(list[0]!.id);
    expect(finance?.lifetimeGrossAmount).toBeGreaterThanOrEqual(0);
    expect(creds[0]?.keyPrefix).toContain("****");
    expect(status.displayStatus).toBe("Suspended");
    expect(api.displayStatus).toBe("Suspended");
    expect(rotate.accepted).toBe(true);
  });

  it("API merchant list uses bounded path and maps volume", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [sampleMerchant],
      meta: { requestId: "req_list", timestamp: AS_OF, hasMore: false },
    });
    const rows = await listMerchants({ q: "Live", limit: 50 });
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/merchants");
    expect(apiRequestMock.mock.calls[0]![1].query).toMatchObject({
      q: "Live",
      limit: 50,
    });
    expect(rows[0]?.volume).toBe(9_999_000);
    expect(rows[0]?.apiAccess).toBe("Enabled");
  });

  it("API merchant detail uses typed get path", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: sampleMerchant,
      meta: { requestId: "req_d", timestamp: AS_OF },
    });
    const m = await getMerchant("m_live");
    expect(apiRequestMock.mock.calls[0]![0]).toBe("/v1/admin/merchants/m_live");
    expect(m?.name).toBe("Live Store");
  });

  it("API status uses typed endpoint not generic actions", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { id: "m_live", status: "SUSPENDED", displayName: "Live" },
      meta: { requestId: "req_st", timestamp: AS_OF },
    });
    const result = await updateMerchantStatus({
      merchantId: "m_live",
      status: "SUSPENDED",
      reason: "Policy violation requires suspension",
      idempotencyKey: "idem-status-1",
    });
    const [path, opts] = apiRequestMock.mock.calls[0]!;
    expect(path).toBe("/v1/admin/merchants/m_live/status");
    expect(opts.method).toBe("POST");
    expect(opts.body).toEqual({
      status: "SUSPENDED",
      reason: "Policy violation requires suspension",
    });
    expect(opts.idempotencyKey).toBe("idem-status-1");
    expect(opts.requireRecentMfa).toBe(true);
    expect(result.displayStatus).toBe("Suspended");
  });

  it("API api-access uses independent typed endpoint", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        merchantId: "m_live",
        status: "ACTIVE",
        paymentMode: "LIVE",
        capability: "QRIS_API",
      },
      meta: { requestId: "req_api", timestamp: AS_OF },
    });
    const result = await updateMerchantApiAccess({
      merchantId: "m_live",
      status: "ACTIVE",
      reason: "KYC approved restore production API",
      idempotencyKey: "idem-api-1",
    });
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/merchants/m_live/api-access/status",
    );
    expect(apiRequestMock.mock.calls[0]![1].body).toEqual({
      status: "ACTIVE",
      reason: "KYC approved restore production API",
    });
    expect(result.displayStatus).toBe("Enabled");
  });

  it("API credential rotate never accepts raw key material", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { id: "iss_1", status: "AUTHORIZED", merchantId: "m_live" },
      meta: { requestId: "req_c", timestamp: AS_OF },
    });
    const result = await authorizeMerchantCredential({
      merchantId: "m_live",
      reason: "Rotate after suspected credential leak",
      mode: "rotate",
      idempotencyKey: "idem-rot-1",
    });
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/merchants/m_live/api-credentials/rotate",
    );
    expect(result.accepted).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/fsk_live_/);
    expect(JSON.stringify(result)).not.toMatch(/fsk_test_/);

    expect(() =>
      adminCredentialAuthorizeDataSchema.parse({
        id: "x",
        rawKey: "fsk_live_secret",
      }),
    ).toThrow();
  });

  it("API finance summary uses admin projection path", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        merchantId: "m_live",
        availableAmount: 100,
        pendingAmount: 0,
        heldAmount: 0,
        lifetimeGrossAmount: 500,
        lifetimeNetAmount: 450,
        currency: "IDR",
        asOf: AS_OF,
      },
      meta: { requestId: "req_f", timestamp: AS_OF },
    });
    const fin = await getMerchantFinanceSummary("m_live");
    expect(apiRequestMock.mock.calls[0]![0]).toBe(
      "/v1/admin/merchants/m_live/finance/summary",
    );
    expect(fin?.availableAmount).toBe(100);
    expect(fin?.lifetimeGrossAmount).toBe(500);
  });

  it("query keys isolate merchant detail, finance, credentials", () => {
    expect(queryKeys.admin.merchant("m1")).toEqual([
      "admin",
      "merchants",
      "m1",
    ]);
    expect(queryKeys.admin.merchantFinance("m1")).toEqual([
      "admin",
      "merchants",
      "m1",
      "finance",
    ]);
    expect(queryKeys.admin.merchantCredentials("m1")).toEqual([
      "admin",
      "merchants",
      "m1",
      "credentials",
    ]);
    expect(queryKeys.admin.merchants({ q: "a" })).not.toEqual(
      queryKeys.admin.merchants({ q: "b" }),
    );
  });
});
