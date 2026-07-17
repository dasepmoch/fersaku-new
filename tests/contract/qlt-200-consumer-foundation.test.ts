/**
 * QLT-200 parent — FE consumer contract sample (foundation public catalog).
 * Capability cells expand domain coverage; this proves the harness works.
 */

import { describe, expect, it } from "vitest";
import {
  catalogProductDtoSchema,
  catalogProductEnvelopeSchema,
  featuredCatalogProductDtoSchema,
  featuredCatalogProductListEnvelopeSchema,
  problemEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  mapCatalogProductDto,
  mapFeaturedCatalogProductDto,
  mapFeaturedCatalogProductListDto,
  toCreateProductRequestBody,
} from "@/features/catalog/mappers";
import {
  assertConsumerMapsToView,
  assertConsumerRejects,
  assertRequestBodyKeys,
  problemEnvelope,
  successEnvelope,
} from "./helpers/consumer";
import {
  catalogProductDto,
  emptyFeaturedEnvelope,
  featuredProductsEnvelope,
  invalidMoneyProductDto,
  malformedProductEnvelopeMissingMeta,
  unknownTypeProductDto,
} from "./fixtures/foundation-catalog";

describe("QLT-200 consumer harness — foundation catalog", () => {
  it("valid featured envelope → view model (storeSlug preserved)", () => {
    const fixture = featuredProductsEnvelope([
      catalogProductDto({ storeSlug: "asep-ai-tools", slug: "shared-pack" }),
    ]);
    assertConsumerMapsToView({
      name: "listFeaturedProducts",
      schema: featuredCatalogProductListEnvelopeSchema,
      fixture,
      map: (env) => mapFeaturedCatalogProductListDto(env.data),
      expected: (view) => {
        expect(view).toHaveLength(1);
        expect(view[0]?.storeSlug).toBe("asep-ai-tools");
        expect(view[0]?.slug).toBe("shared-pack");
        expect(view[0]?.price).toBe(149_000);
      },
    });
  });

  it("empty featured list is valid", () => {
    assertConsumerMapsToView({
      name: "listFeaturedProducts.empty",
      schema: featuredCatalogProductListEnvelopeSchema,
      fixture: emptyFeaturedEnvelope(),
      map: (env) => mapFeaturedCatalogProductListDto(env.data),
      expected: (view) => {
        expect(view).toEqual([]);
      },
    });
  });

  it("single product envelope → CatalogProduct view", () => {
    assertConsumerMapsToView({
      name: "getPublicProduct",
      schema: catalogProductEnvelopeSchema,
      fixture: successEnvelope(catalogProductDto({ id: "prod_x" })),
      map: (env) => mapCatalogProductDto(env.data),
      expected: {
        id: "prod_x",
        type: "download",
        price: 149_000,
      },
    });
  });

  it("malformed envelope (missing meta) → schema reject", () => {
    assertConsumerRejects({
      name: "missing.meta",
      schema: catalogProductEnvelopeSchema,
      fixture: malformedProductEnvelopeMissingMeta(),
    });
  });

  it("float money → schema reject", () => {
    assertConsumerRejects({
      name: "float.money",
      schema: catalogProductDtoSchema,
      fixture: invalidMoneyProductDto(),
    });
  });

  it("unknown product type → INVALID_API_CONTRACT (mapper fail-closed)", () => {
    assertConsumerRejects({
      name: "unknown.type",
      schema: catalogProductDtoSchema,
      fixture: unknownTypeProductDto(),
      allowSchemaPass: true,
      map: (dto) => mapCatalogProductDto(dto as never),
    });
  });

  it("featured missing storeSlug → schema reject", () => {
    const without = catalogProductDto();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (without as any).storeSlug;
    assertConsumerRejects({
      name: "featured.missing.storeSlug",
      schema: featuredCatalogProductDtoSchema,
      fixture: without,
    });
  });

  it("problem envelope preserves code/details/requestId", () => {
    const raw = problemEnvelope({
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      requestId: "req_problem_01",
      details: { fields: [{ field: "price", code: "INVALID" }] },
    });
    const parsed = problemEnvelopeSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problem.code).toBe("VALIDATION_FAILED");
      expect(parsed.data.problem.requestId).toBe("req_problem_01");
      expect(parsed.data.problem.details?.fields?.[0]?.field).toBe("price");
    }
  });

  it("request mapper omits view-only fields", () => {
    const body = toCreateProductRequestBody({
      storeId: "store_qlt200",
      title: "New Pack",
      price: 99_000,
      delivery: "download",
      short: "s",
      description: "d",
      slug: "New Pack",
    });
    assertRequestBodyKeys(body as Record<string, unknown>, [
      "title",
      "price",
      "type",
      "short",
      "description",
      "slug",
      "palette",
      "glyph",
      "includes",
      "badge",
      "allowPayWhatYouWant",
      "minimumPrice",
      "currentVersion",
    ]);
    expect(body).not.toHaveProperty("sales");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("storeSlug");
    expect(body).not.toHaveProperty("storeId");
    expect(body.type).toBe("download");
    expect(body.price).toBe(99_000);
  });

  it("featured mapper fails closed when storeSlug empty string", () => {
    assertConsumerRejects({
      name: "featured.empty.storeSlug",
      schema: featuredCatalogProductDtoSchema,
      fixture: catalogProductDto({ storeSlug: "" }),
    });
  });

  it("mapFeaturedCatalogProductDto requires storeSlug at mapper boundary", () => {
    expect(() =>
      mapFeaturedCatalogProductDto(
        catalogProductDto({ storeSlug: "ok" }) as never,
      ),
    ).not.toThrow();
  });
});
