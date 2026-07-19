import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminFulfillmentDtoSchema,
  adminInventorySnapshotDtoSchema,
  inventoryRevealDataSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  assertNoSecretsInAdminInventory,
  demoAdminFulfillments,
  demoInventory,
  forceFulfillAdminOrder,
  getInventory,
  listAdminFulfillments,
  mapAdminFulfillmentDto,
  mapAdminFulfillmentStatusDisplay,
  mapAdminInventoryRevealDto,
  mapAdminInventorySnapshotDto,
  revealInventoryItem,
  revokeAdminDelivery,
} from "@/features/admin/data";
import { queryKeys } from "@/shared/query/query-keys";
import {
  clearRecentMfaProof,
  setRecentMfaProof,
  wireHttpClientRecentMfaHooks,
} from "@/shared/api/recent-mfa-proof";

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

const meta = {
  requestId: "req_adm320",
  timestamp: "2026-07-17T12:00:00Z",
  hasMore: false,
  nextCursor: null,
};

const sampleSnapshot = {
  products: [
    {
      id: "prod_1",
      title: "Canva Pro",
      type: "code",
      available: 10,
      reserved: 1,
      sold: 5,
      invalid: 0,
      lowAt: 3,
      delivery: "Credentials",
    },
  ],
  items: [
    {
      id: "stk_1",
      schemaPreview: "username | password",
      status: "Available",
      createdAt: "12 Jul 2026",
    },
  ],
  schema: [
    {
      key: "username",
      label: "Username",
      secret: false,
      required: true,
      buyerCopyable: true,
    },
    {
      key: "password",
      label: "Password",
      secret: true,
      required: true,
      buyerCopyable: false,
    },
  ],
};

const sampleFulfillment = {
  id: "dlv_1",
  order: "FRS-1",
  merchant: "Store",
  type: "Credentials",
  target: "Product",
  status: "Failed",
  attempts: 2,
  time: "14:00:00",
};

describe("ADM-320 admin inventory redaction/reveal + fulfillment", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
    clearRecentMfaProof();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
    clearRecentMfaProof();
  });

  it("list snapshot never carries values/secrets bags", () => {
    const snap = demoInventory();
    expect(snap.items[0]).not.toHaveProperty("values");
    expect(snap.items[0]).not.toHaveProperty("secrets");
    expect(snap.items[0].schemaPreview).toBeTruthy();
    expect(() => assertNoSecretsInAdminInventory(snap)).not.toThrow();
  });

  it("maps redacted inventory DTO and rejects secret material", () => {
    const view = mapAdminInventorySnapshotDto(
      adminInventorySnapshotDtoSchema.parse(sampleSnapshot),
    );
    expect(view.items[0].schemaPreview).toBe("username | password");
    expect(view.items[0]).not.toHaveProperty("values");
    expect(() => assertNoSecretsInAdminInventory(view)).not.toThrow();
  });

  it("assertNoSecrets throws when values present on items", () => {
    expect(() =>
      assertNoSecretsInAdminInventory({
        products: [],
        items: [
          {
            id: "x",
            schemaPreview: "a",
            status: "Available",
            createdAt: "now",
            values: { password: "secret" },
          } as never,
        ],
        schema: [],
      }),
    ).toThrow(/values/);
  });

  it("maps reveal DTO to component-local secret with TTL", () => {
    const dto = inventoryRevealDataSchema.parse({
      itemId: "stk_1",
      productId: "prod_1",
      secrets: { password: "OnceOnly" },
      auditId: "audit_1",
    });
    const secret = mapAdminInventoryRevealDto(dto, "2026-07-17T12:01:00Z");
    expect(secret.itemId).toBe("stk_1");
    expect(secret.values.password).toBe("OnceOnly");
    expect(secret.expiresAt).toBe("2026-07-17T12:01:00Z");
  });

  it("permission deny inventory.read / inventory.reveal / fulfillment.read / force", () => {
    expect(claimsHavePermission([], "inventory.read")).toBe(false);
    expect(claimsHavePermission(["inventory.read"], "inventory.reveal")).toBe(
      false,
    );
    expect(claimsHavePermission(["fulfillment.read"], "fulfillment.force")).toBe(
      false,
    );
    expect(
      claimsHavePermission(
        ["inventory.read", "inventory.reveal", "fulfillment.read", "fulfillment.force"],
        "inventory.reveal",
      ),
    ).toBe(true);
  });

  it("mock path never hits transport for inventory/fulfillment reads", async () => {
    installMockAdmin();
    await getInventory();
    await listAdminFulfillments();
    const secret = await revealInventoryItem({
      itemId: demoInventory().items[0]?.id ?? "stk_missing",
      reason: "support investigation reason",
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
    if (demoInventory().items[0]) {
      expect(secret.itemId).toBeTruthy();
      expect(secret.values).toBeTruthy();
    }
  });

  it("API inventory GET uses redacted path only", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: sampleSnapshot,
      meta,
    });
    const snap = await getInventory();
    expect(apiRequestMock.mock.calls[0]?.[0]).toBe("/v1/admin/inventory");
    expect(snap.items[0]).not.toHaveProperty("secrets");
  });

  it("reveal posts with requireRecentMfa; no body mfaVerified; secrets not in query keys", async () => {
    installApiAdmin();
    setRecentMfaProof("proof_reveal", { purpose: "inventory.reveal" });
    wireHttpClientRecentMfaHooks();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        itemId: "stk_1",
        productId: "prod_1",
        secrets: { password: "OnceOnly" },
        auditId: "audit_1",
      },
      meta,
    });
    const revealed = await revealInventoryItem({
      itemId: "stk_1",
      reason: "support ticket investigation",
    });
    expect(revealed.values.password).toBe("OnceOnly");
    const opts = apiRequestMock.mock.calls[0]?.[1] as {
      requireRecentMfa?: boolean;
      method?: string;
      body?: { reason?: string; mfaVerified?: boolean };
    };
    expect(opts.method).toBe("POST");
    expect(opts.requireRecentMfa).toBe(true);
    expect(opts.body?.reason).toBe("support ticket investigation");
    expect(opts.body).not.toHaveProperty("mfaVerified");
    expect(apiRequestMock.mock.calls[0]?.[0]).toBe(
      "/v1/admin/inventory/items/stk_1/reveal",
    );
    const invKey = JSON.stringify(queryKeys.admin.inventory({}));
    expect(invKey).not.toMatch(/OnceOnly|password|proof_reveal|secret/i);
    const fulKey = JSON.stringify(queryKeys.admin.fulfillment({}));
    expect(fulKey).not.toMatch(/OnceOnly|proof_reveal/i);
  });

  it("reveal rejects short reason without transport", async () => {
    installApiAdmin();
    await expect(
      revealInventoryItem({ itemId: "stk_1", reason: "short" }),
    ).rejects.toThrow(/12/);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("maps fulfillment DTO status labels", () => {
    expect(mapAdminFulfillmentStatusDisplay("ACTIVE")).toBe("Fulfilled");
    expect(mapAdminFulfillmentStatusDisplay("DELIVERY_FAILED")).toBe("Failed");
    expect(mapAdminFulfillmentStatusDisplay("PENDING_FULFILLMENT")).toBe(
      "Pending",
    );
    expect(mapAdminFulfillmentStatusDisplay("REVOKED")).toBe("Revoked");
    const view = mapAdminFulfillmentDto(
      adminFulfillmentDtoSchema.parse(sampleFulfillment),
    );
    expect(view.status).toBe("Failed");
    expect(view.attempts).toBe(2);
  });

  it("API fulfillment list uses GET /v1/admin/fulfillments", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [sampleFulfillment],
      meta,
    });
    const rows = await listAdminFulfillments();
    expect(apiRequestMock.mock.calls[0]?.[0]).toBe("/v1/admin/fulfillments");
    expect(rows[0]?.status).toBe("Failed");
  });

  it("force-fulfill and revoke use typed order delivery routes + MFA", async () => {
    installApiAdmin();
    apiRequestMock
      .mockResolvedValueOnce({
        data: {
          id: "g1",
          orderId: "FRS-1",
          status: "ACTIVE",
        },
        meta,
      })
      .mockResolvedValueOnce({
        data: {
          id: "g1",
          orderId: "FRS-1",
          status: "REVOKED",
        },
        meta,
      });
    const forced = await forceFulfillAdminOrder({
      orderId: "FRS-1",
      reason: "provider verified paid order recovery",
    });
    expect(forced.status).toBe("ACTIVE");
    expect(apiRequestMock.mock.calls[0]?.[0]).toBe(
      "/v1/admin/orders/FRS-1/delivery/force-fulfill",
    );
    const forceOpts = apiRequestMock.mock.calls[0]?.[1] as {
      requireRecentMfa?: boolean;
      body?: { reason?: string };
    };
    expect(forceOpts.requireRecentMfa).toBe(true);
    expect(forceOpts.body?.reason).toContain("provider verified");

    const revoked = await revokeAdminDelivery({
      orderId: "FRS-1",
      reason: "fraudulent access must be revoked now",
    });
    expect(revoked.status).toBe("REVOKED");
    expect(apiRequestMock.mock.calls[1]?.[0]).toBe(
      "/v1/admin/orders/FRS-1/delivery/revoke",
    );
  });

  it("mock force/revoke never hits transport", async () => {
    installMockAdmin();
    await forceFulfillAdminOrder({
      orderId: "FRS-1",
      reason: "mock force fulfill reason",
    });
    await revokeAdminDelivery({
      orderId: "FRS-1",
      reason: "mock revoke delivery reason",
    });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("demo fulfillments seed matches snapshot shape", () => {
    const rows = demoAdminFulfillments();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.status === "Failed")).toBe(true);
    expect(rows[0]).not.toHaveProperty("secrets");
  });
});
