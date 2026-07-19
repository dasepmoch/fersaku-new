import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inventoryProductSummaryDtoSchema,
  inventoryProductSummaryListEnvelopeSchema,
  inventoryProductDetailEnvelopeSchema,
  inventoryRevealEnvelopeSchema,
  inventorySchemaEnvelopeSchema,
  inventoryStockItemMaskedDtoSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import {
  getSellerInventoryDetail,
  getSellerInventoryProduct,
  importSellerInventoryItems,
  listSellerInventory,
  revealSellerInventoryItem,
  revokeSellerInventoryItem,
} from "@/features/seller/inventory/api";
import {
  assertNoSecretsInInventoryProduct,
  assertNoSecretsInStockItems,
  mapInventoryProductSummaryDto,
  mapInventoryProductTypeLabel,
  mapInventorySchemaDto,
  mapInventoryStockItemMaskedDto,
  mapStockItemStatus,
  parseImportLines,
  redactRevealForLog,
} from "@/features/seller/inventory/mappers";
import type { InventoryProduct } from "@/features/seller/inventory/contracts";
import { HTTP_HEADERS } from "@/shared/api/http-client";
import {
  clearRecentMfaProof,
  setRecentMfaProof,
  wireHttpClientRecentMfaHooks,
  __resetRecentMfaProofForTests,
} from "@/shared/api/recent-mfa-proof";

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
  requestId: "req_sel240",
  timestamp: "2026-07-17T10:00:00Z",
};

const summaryDto = {
  productId: "prod_live_1",
  storeId: "store_live",
  title: "Canva Pro Team",
  type: "code",
  activeSchemaVersion: 2,
  available: 10,
  reserved: 2,
  delivered: 50,
  revoked: 1,
  total: 63,
};

const maskedItem = {
  id: "stk_1",
  productId: "prod_live_1",
  storeId: "store_live",
  schemaVersion: 2,
  status: "AVAILABLE",
  masked: { username: "u@example.com", password: "••••••••" },
  createdAt: "2026-07-12T07:33:00Z",
  updatedAt: "2026-07-12T07:33:00Z",
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

beforeEach(() => {
  apiRequestMock.mockReset();
  __resetRecentMfaProofForTests();
  clearRecentMfaProof();
});

afterEach(() => {
  clearDomainSourceSnapshot();
  __resetRecentMfaProofForTests();
});

describe("SEL-240 schemas", () => {
  it("accepts inventory product summary list envelope", () => {
    const parsed = inventoryProductSummaryListEnvelopeSchema.parse({
      data: [summaryDto],
      meta,
    });
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]?.productId).toBe("prod_live_1");
  });

  it("accepts detail envelope with masked items only", () => {
    const parsed = inventoryProductDetailEnvelopeSchema.parse({
      data: { summary: summaryDto, items: [maskedItem] },
      meta,
    });
    expect(parsed.data.items[0]).not.toHaveProperty("secrets");
    expect(parsed.data.items[0]).not.toHaveProperty("encryptedPayload");
  });

  it("accepts reveal envelope with secrets", () => {
    const parsed = inventoryRevealEnvelopeSchema.parse({
      data: {
        itemId: "stk_1",
        productId: "prod_live_1",
        schemaVersion: 2,
        status: "AVAILABLE",
        secrets: { password: "Plain#1" },
        auditId: "audit_1",
      },
      meta,
    });
    expect(parsed.data.secrets.password).toBe("Plain#1");
  });
});

describe("SEL-240 mappers", () => {
  it("maps summary to InventoryProduct without secrets", () => {
    const view = mapInventoryProductSummaryDto(
      inventoryProductSummaryDtoSchema.parse(summaryDto),
    );
    expect(view.id).toBe("prod_live_1");
    expect(view.title).toBe("Canva Pro Team");
    expect(view.type).toBe("Single code");
    expect(view.sold).toBe(50);
    expect(view.invalid).toBe(1);
    expect(view).not.toHaveProperty("secrets");
    expect(() => assertNoSecretsInInventoryProduct(view)).not.toThrow();
  });

  it("maps stock status DELIVERED→Sold, REVOKED→Invalid", () => {
    expect(mapStockItemStatus("DELIVERED")).toBe("Sold");
    expect(mapStockItemStatus("REVOKED")).toBe("Invalid");
    expect(mapStockItemStatus("AVAILABLE")).toBe("Available");
  });

  it("maps product type labels", () => {
    expect(mapInventoryProductTypeLabel("code")).toBe("Single code");
    expect(mapInventoryProductTypeLabel("download")).toBe("Download");
  });

  it("maps masked item without secrets bag", () => {
    const item = mapInventoryStockItemMaskedDto(
      inventoryStockItemMaskedDtoSchema.parse(maskedItem),
    );
    expect(item.id).toBe("stk_1");
    expect(item.status).toBe("Available");
    expect(item.values.username).toBe("u@example.com");
    expect(() => assertNoSecretsInStockItems([item])).not.toThrow();
  });

  it("maps schema fields", () => {
    const schema = mapInventorySchemaDto(
      inventorySchemaEnvelopeSchema.parse({
        data: {
          id: "sch_1",
          productId: "prod_live_1",
          storeId: "store_live",
          version: 2,
          fields: [
            {
              key: "password",
              label: "Password",
              secret: true,
              required: true,
              buyerCopyable: true,
            },
          ],
          delimiter: "|",
          checksum: "abc",
          createdAt: "2026-07-12T00:00:00Z",
        },
        meta,
      }).data,
    );
    expect(schema.version).toBe(2);
    expect(schema.fields[0]?.secret).toBe(true);
  });

  it("parses pipe-delimited import lines", () => {
    const rows = parseImportLines("a|b\nc|d", [
      {
        key: "username",
        label: "U",
        secret: false,
        required: true,
        buyerCopyable: true,
      },
      {
        key: "password",
        label: "P",
        secret: true,
        required: true,
        buyerCopyable: true,
      },
    ]);
    expect(rows).toEqual([
      { username: "a", password: "b" },
      { username: "c", password: "d" },
    ]);
  });

  it("redactRevealForLog drops secret values", () => {
    const r = redactRevealForLog({
      itemId: "stk_1",
      productId: "p",
      auditId: "a",
      secrets: { password: "SECRET" },
    });
    expect(r).not.toHaveProperty("secrets");
    expect(r.secretKeys).toEqual(["password"]);
  });
});

describe("SEL-240 API adapters", () => {
  it("list path is store-scoped and never returns secrets", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [summaryDto],
      meta,
    });
    const list = await listSellerInventory("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/inventory/products",
      expect.objectContaining({
        schema: inventoryProductSummaryListEnvelopeSchema,
      }),
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("prod_live_1");
    for (const p of list) {
      expect(() => assertNoSecretsInInventoryProduct(p)).not.toThrow();
      expect(JSON.stringify(p)).not.toMatch(/secrets|encrypted/i);
    }
  });

  it("list encodes storeId", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({ data: [], meta });
    await listSellerInventory("store/with space");
    expect(apiRequestMock.mock.calls[0]?.[0]).toBe(
      "/v1/stores/store%2Fwith%20space/inventory/products",
    );
  });

  it("foreign product detail returns null on 404", async () => {
    installApiSeller();
    const { ApiError } = await import("@/shared/api/http-client");
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Not found",
        requestId: "r1",
      }),
    );
    const product = await getSellerInventoryProduct("store_a", "foreign_prod");
    expect(product).toBeNull();
  });

  it("detail maps masked items only", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { summary: summaryDto, items: [maskedItem] },
      meta,
    });
    const detail = await getSellerInventoryDetail("store_live", "prod_live_1");
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]).not.toHaveProperty("secrets");
    expect(() => assertNoSecretsInStockItems(detail!.items)).not.toThrow();
  });

  it("reveal posts with requireRecentMfa and keeps secrets out of list path", async () => {
    installApiSeller();
    setRecentMfaProof("proof_reveal", { purpose: "inventory.reveal" });
    wireHttpClientRecentMfaHooks();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        itemId: "stk_1",
        productId: "prod_live_1",
        secrets: { password: "OnceOnly" },
        auditId: "audit_1",
      },
      meta,
    });
    const revealed = await revealSellerInventoryItem({
      storeId: "store_live",
      itemId: "stk_1",
      reason: "support",
    });
    expect(revealed.secrets.password).toBe("OnceOnly");
    const opts = apiRequestMock.mock.calls[0]?.[1] as {
      requireRecentMfa?: boolean;
      method?: string;
      body?: { reason?: string; mfaVerified?: boolean };
    };
    expect(opts.method).toBe("POST");
    expect(opts.requireRecentMfa).toBe(true);
    expect(opts.body?.reason).toBe("support");
    expect(opts.body).not.toHaveProperty("mfaVerified");
    expect(apiRequestMock.mock.calls[0]?.[0]).toContain(
      "/inventory/items/stk_1/reveal",
    );
  });

  it("import posts expectedSchemaVersion + items with idempotency", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: { imported: 2, itemIds: ["a", "b"] },
      meta,
    });
    const result = await importSellerInventoryItems({
      storeId: "store_live",
      productId: "prod_live_1",
      expectedSchemaVersion: 2,
      items: [{ username: "a", password: "b" }],
    });
    expect(result.imported).toBe(2);
    const opts = apiRequestMock.mock.calls[0]?.[1] as {
      method?: string;
      body?: { expectedSchemaVersion?: number };
      idempotencyKey?: string;
    };
    expect(opts.method).toBe("POST");
    expect(opts.body?.expectedSchemaVersion).toBe(2);
    expect(opts.idempotencyKey).toBeTruthy();
  });

  it("revoke returns masked Invalid status", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        ...maskedItem,
        status: "REVOKED",
      },
      meta,
    });
    const item = await revokeSellerInventoryItem({
      storeId: "store_live",
      itemId: "stk_1",
      reason: "compromised",
    });
    expect(item.status).toBe("Invalid");
    expect(item).not.toHaveProperty("secrets");
  });

  it("mock path never hits transport", async () => {
    installMockSeller();
    const list = await listSellerInventory("any");
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(list.length).toBeGreaterThan(0);
    const product = await getSellerInventoryProduct("any", list[0]!.id);
    expect(product?.title).toBeTruthy();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});

describe("SEL-240 query keys", () => {
  it("inventory keys are store-scoped and never hold secrets", () => {
    const listKey = queryKeys.seller.inventory("store_a");
    const productKey = queryKeys.seller.inventoryProduct("store_a", "prod_1");
    const detailKey = queryKeys.seller.inventoryProductDetail(
      "store_a",
      "prod_1",
    );
    const schemaKey = queryKeys.seller.inventorySchema("store_a", "prod_1");
    expect(listKey).toEqual(["seller", "store_a", "inventory"]);
    expect(productKey[1]).toBe("store_a");
    expect(detailKey).toContain("detail");
    expect(schemaKey).toContain("schema");
    const serialized = JSON.stringify([
      listKey,
      productKey,
      detailKey,
      schemaKey,
    ]);
    expect(serialized).not.toMatch(/secret|password|mfa|proof/i);
  });

  it("foreign store keys do not collide", () => {
    expect(queryKeys.seller.inventory("store_a")).not.toEqual(
      queryKeys.seller.inventory("store_b"),
    );
  });
});

describe("SEL-240 list product invariant", () => {
  it("mapped list product shape matches InventoryProduct fields only", () => {
    const view: InventoryProduct = mapInventoryProductSummaryDto(
      inventoryProductSummaryDtoSchema.parse(summaryDto),
    );
    const keys = Object.keys(view).sort();
    expect(keys).toEqual(
      [
        "activeSchemaVersion",
        "available",
        "delivery",
        "id",
        "invalid",
        "lowAt",
        "reserved",
        "sold",
        "storeId",
        "title",
        "total",
        "type",
      ].sort(),
    );
  });
});

// silence unused HTTP_HEADERS import if tree-shaken differently
void HTTP_HEADERS;
