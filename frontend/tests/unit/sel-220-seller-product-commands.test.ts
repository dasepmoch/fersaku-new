import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import {
  archiveSellerProduct,
  createSellerProduct,
  patchSellerProduct,
  publishSellerProduct,
} from "@/features/catalog/api";
import {
  defaultProductGlyph,
  mapDeliveryOptionToDeliveryKind,
  mapDeliveryOptionToWireType,
  mapFieldViolationsToProductFields,
  mapProductCommandThrown,
  normalizeProductSlug,
  parseProductPriceIdr,
  productDetailStatusLabel,
  toCreateProductRequestBody,
  toPatchProductRequestBody,
} from "@/features/catalog/mappers";

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

function productDto(
  overrides: Partial<{
    id: string;
    slug: string;
    title: string;
    type: "download" | "link" | "code";
    status: "draft" | "published" | "archived";
    price: number;
  }> = {},
) {
  return {
    id: overrides.id ?? "prod_new",
    slug: overrides.slug ?? "ai-prompt-pack",
    title: overrides.title ?? "AI Prompt Pack",
    short: "Short",
    description: "Full description",
    price: overrides.price ?? 79_000,
    type: overrides.type ?? "download",
    sales: 0,
    palette: "#e9ff9b",
    glyph: "AI",
    includes: [] as string[],
    status: overrides.status ?? "draft",
    storeId: "store_live",
  };
}

describe("SEL-220 seller product commands", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps delivery options: credentials → code + CREDENTIAL (not a new type)", () => {
    expect(mapDeliveryOptionToWireType("credentials")).toBe("code");
    expect(mapDeliveryOptionToDeliveryKind("credentials")).toBe("CREDENTIAL");
    expect(mapDeliveryOptionToWireType("code")).toBe("code");
    expect(mapDeliveryOptionToDeliveryKind("code")).toBe("CODE");
    expect(mapDeliveryOptionToWireType("download")).toBe("download");
    expect(mapDeliveryOptionToWireType("link")).toBe("link");
  });

  it("create body never sends credentials as wire type", () => {
    const body = toCreateProductRequestBody({
      storeId: "store_a",
      title: "Account Pack",
      price: 50_000,
      delivery: "credentials",
      slug: "Account Pack!!",
    });
    expect(body.type).toBe("code");
    expect(body.slug).toBe("account-pack");
    expect(body).not.toHaveProperty("status");
    expect(JSON.stringify(body)).not.toContain("credentials");
  });

  it("patch body never includes status", () => {
    const body = toPatchProductRequestBody({
      storeId: "store_a",
      productId: "prod_1",
      title: "Updated",
      delivery: "code",
      price: 10_000,
    });
    expect(body.type).toBe("code");
    expect(body).not.toHaveProperty("status");
  });

  it("normalizes slug and parses whole IDR price", () => {
    expect(normalizeProductSlug(" Hello World!! ")).toBe("hello-world");
    expect(parseProductPriceIdr("79.000")).toBe(79_000);
    expect(parseProductPriceIdr("")).toBeNull();
    expect(defaultProductGlyph("AI Prompt")).toBe("AI");
  });

  it("maps validation + slug conflict to form fields", () => {
    const fields = mapFieldViolationsToProductFields([
      { field: "title", code: "REQUIRED", message: "required" },
      { field: "price", code: "INVALID" },
    ]);
    expect(fields.map((f) => f.field)).toEqual(["title", "price"]);

    const conflict = mapProductCommandThrown(
      new ApiError(409, {
        code: "CONFLICT",
        message: "Product slug already exists in this store",
        requestId: "req_1",
      }),
    );
    expect(conflict.kind).toBe("field_errors");
    if (conflict.kind === "field_errors") {
      expect(conflict.fields[0]?.field).toBe("slug");
    }

    const validation = mapProductCommandThrown(
      new ApiError(400, {
        code: "VALIDATION_FAILED",
        message: "Invalid",
        requestId: "req_2",
        details: {
          fields: [{ field: "price", code: "INVALID", message: "bad price" }],
        },
      }),
    );
    expect(validation.kind).toBe("field_errors");
    if (validation.kind === "field_errors") {
      expect(validation.fields[0]).toEqual({
        field: "price",
        message: "bad price",
      });
    }
  });

  it("create posts store-scoped path with idempotency + mapped body", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: productDto({ type: "code", status: "draft" }),
      meta: { requestId: "r1", timestamp: "2026-07-17T00:00:00Z" },
    });

    const result = await createSellerProduct({
      storeId: "store_live",
      title: "Account Pack",
      price: 50_000,
      delivery: "credentials",
      slug: "account-pack",
      idempotencyKey: "idem-create-1",
    });

    expect(result.status).toBe("draft");
    expect(result.type).toBe("code");
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, opts] = apiRequestMock.mock.calls[0] as [
      string,
      {
        method: string;
        body: Record<string, unknown>;
        idempotencyKey?: string;
      },
    ];
    expect(path).toBe("/v1/stores/store_live/products");
    expect(opts.method).toBe("POST");
    expect(opts.idempotencyKey).toBe("idem-create-1");
    expect(opts.body.type).toBe("code");
    expect(opts.body.title).toBe("Account Pack");
  });

  it("patch uses PATCH and encodes store/product ids", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: productDto({ title: "Renamed", status: "published" }),
      meta: { requestId: "r2", timestamp: "2026-07-17T00:00:00Z" },
    });

    await patchSellerProduct({
      storeId: "store/a",
      productId: "prod/1",
      title: "Renamed",
      price: 12_000,
    });

    const [path, opts] = apiRequestMock.mock.calls[0] as [
      string,
      { method: string; body: Record<string, unknown> },
    ];
    expect(path).toBe("/v1/stores/store%2Fa/products/prod%2F1");
    expect(opts.method).toBe("PATCH");
    expect(opts.body).not.toHaveProperty("status");
    expect(opts.body.title).toBe("Renamed");
  });

  it("publish posts empty body path; archive returns archived product", async () => {
    installApiSeller();
    apiRequestMock
      .mockResolvedValueOnce({
        data: {
          accepted: true,
          productId: "prod_new",
          requestId: "req_pub",
          product: productDto({ status: "published" }),
        },
        meta: { requestId: "r3", timestamp: "2026-07-17T00:00:00Z" },
      })
      .mockResolvedValueOnce({
        data: productDto({ status: "archived" }),
        meta: { requestId: "r4", timestamp: "2026-07-17T00:00:00Z" },
      });

    const pub = await publishSellerProduct({
      storeId: "store_live",
      productId: "prod_new",
      idempotencyKey: "idem-pub-1",
      reason: "seller_product_catalog_publish",
    });
    expect(pub.accepted).toBe(true);
    expect(pub.product?.status).toBe("published");

    const arch = await archiveSellerProduct({
      storeId: "store_live",
      productId: "prod_new",
      idempotencyKey: "idem-arch-1",
    });
    expect(arch.status).toBe("archived");

    const publishCall = apiRequestMock.mock.calls[0] as [
      string,
      { method: string; idempotencyKey?: string; body?: unknown },
    ];
    expect(publishCall[0]).toBe(
      "/v1/stores/store_live/products/prod_new/publish",
    );
    expect(publishCall[1].method).toBe("POST");
    expect(publishCall[1].idempotencyKey).toBe("idem-pub-1");
    expect(publishCall[1].body).toBeUndefined();

    const archiveCall = apiRequestMock.mock.calls[1] as [
      string,
      { method: string },
    ];
    expect(archiveCall[0]).toBe(
      "/v1/stores/store_live/products/prod_new/archive",
    );
    expect(archiveCall[1].method).toBe("POST");
  });

  it("mock path never hits transport", async () => {
    installMockSeller();
    const created = await createSellerProduct({
      storeId: "store_demo",
      title: "Mock Draft",
      price: 10_000,
      delivery: "download",
    });
    expect(created.status).toBe("draft");
    expect(created.id.startsWith("mock_prod_")).toBe(true);

    const pub = await publishSellerProduct({
      storeId: "store_demo",
      productId: "prod_01",
    });
    expect(pub.accepted).toBe(true);

    const arch = await archiveSellerProduct({
      storeId: "store_demo",
      productId: "prod_01",
    });
    expect(arch.status).toBe("archived");

    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("detail status label maps draft/published/archived", () => {
    expect(productDetailStatusLabel("draft")).toBe("Draft");
    expect(productDetailStatusLabel("published")).toBe("Active");
    expect(productDetailStatusLabel("archived")).toBe("Archived");
    expect(productDetailStatusLabel("published", true)).toBe("Archived");
  });

  it("foreign store path isolation uses encoded storeId", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: productDto({ id: "prod_x" }),
      meta: { requestId: "r5", timestamp: "2026-07-17T00:00:00Z" },
    });
    await createSellerProduct({
      storeId: "store_other",
      title: "X",
      price: 1000,
      delivery: "link",
      idempotencyKey: "k",
    });
    expect(apiRequestMock.mock.calls[0][0]).toBe(
      "/v1/stores/store_other/products",
    );
  });
});
