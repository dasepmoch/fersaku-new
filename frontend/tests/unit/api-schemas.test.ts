import { describe, expect, it } from "vitest";
import {
  authLoginEnvelopeSchema,
  catalogProductDtoSchema,
  catalogProductListEnvelopeSchema,
  cursorListEnvelopeSchema,
  cursorListMetaSchema,
  feePolicyEnvelopeSchema,
  moneyIdrSchema,
  numberedPageListEnvelopeSchema,
  numberedPageListMetaSchema,
  problemEnvelopeSchema,
  publicStorefrontEnvelopeSchema,
  rfc3339TimestampSchema,
  statusEnvelopeSchema,
  successEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  mapCatalogProductDto,
  mapPublicStorefrontDto,
} from "@/features/catalog/mappers";
import { ApiError } from "@/shared/api/http-client";
import { demoProducts, getDemoStorefront } from "@/features/catalog/mock";

const meta = {
  requestId: "req_01HTEST",
  timestamp: "2026-07-17T10:00:00Z",
};

const sampleProduct = {
  id: "prod_01",
  slug: "ai-prompt-pack",
  title: "AI Prompt Pack",
  short: "Short",
  description: "Long",
  price: 149_000,
  type: "download" as const,
  sales: 12,
  palette: "violet",
  glyph: "✦",
  includes: ["PDF"],
};

describe("envelope + list schemas", () => {
  it("parses SuccessEnvelope with Meta", () => {
    const schema = successEnvelopeSchema(
      catalogProductDtoSchema.pick({ id: true }),
    );
    const parsed = schema.safeParse({
      data: { id: "x" },
      meta,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed SuccessEnvelope (missing meta)", () => {
    const schema = successEnvelopeSchema(catalogProductDtoSchema);
    const parsed = schema.safeParse({ data: sampleProduct });
    expect(parsed.success).toBe(false);
  });

  it("parses ProblemEnvelope nested problem", () => {
    const parsed = problemEnvelopeSchema.safeParse({
      problem: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        requestId: "req_01HTEST",
        details: {
          fields: [{ field: "email", code: "INVALID" }],
        },
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.problem.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects top-level problem fields as ProblemEnvelope", () => {
    const parsed = problemEnvelopeSchema.safeParse({
      code: "HTTP_ERROR",
      message: "no",
      requestId: "r",
    });
    expect(parsed.success).toBe(false);
  });

  it("parses CursorList envelope + empty list", () => {
    const schema = cursorListEnvelopeSchema(catalogProductDtoSchema);
    const parsed = schema.safeParse({
      data: [],
      meta: {
        ...meta,
        nextCursor: null,
        hasMore: false,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("parses NumberedPageList meta", () => {
    const metaParsed = numberedPageListMetaSchema.safeParse({
      ...meta,
      page: 1,
      pageSize: 20,
      totalCount: 74,
      pageCount: 4,
    });
    expect(metaParsed.success).toBe(true);

    const env = numberedPageListEnvelopeSchema(catalogProductDtoSchema);
    expect(
      env.safeParse({
        data: [sampleProduct],
        meta: {
          ...meta,
          page: 1,
          pageSize: 20,
          totalCount: 1,
          pageCount: 1,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects CursorList missing hasMore", () => {
    expect(
      cursorListMetaSchema.safeParse({
        requestId: "r",
        timestamp: meta.timestamp,
      }).success,
    ).toBe(false);
  });
});

describe("money + timestamp", () => {
  it("accepts safe integer MoneyIdr", () => {
    expect(moneyIdrSchema.safeParse(50_000).success).toBe(true);
    expect(moneyIdrSchema.safeParse(0).success).toBe(true);
  });

  it("rejects fractional money", () => {
    expect(moneyIdrSchema.safeParse(10.5).success).toBe(false);
  });

  it("rejects unsafe integer range", () => {
    expect(moneyIdrSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(
      false,
    );
  });

  it("validates RFC3339 timestamps", () => {
    expect(
      rfc3339TimestampSchema.safeParse("2026-07-17T10:00:00Z").success,
    ).toBe(true);
    expect(rfc3339TimestampSchema.safeParse("not-a-date").success).toBe(false);
  });
});

describe("pilot public + auth samples", () => {
  it("parses catalog product list envelope", () => {
    const parsed = catalogProductListEnvelopeSchema.safeParse({
      data: [sampleProduct],
      meta,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown product type enum", () => {
    const parsed = catalogProductDtoSchema.safeParse({
      ...sampleProduct,
      type: "subscription",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing required product field", () => {
    const { id: _productId, ...rest } = sampleProduct;
    void _productId;
    expect(catalogProductDtoSchema.safeParse(rest).success).toBe(false);
  });

  it("parses public storefront envelope", () => {
    const parsed = publicStorefrontEnvelopeSchema.safeParse({
      data: {
        slug: "demo",
        name: "Demo",
        monogram: "D",
        bio: "Bio",
        products: [sampleProduct],
      },
      meta,
    });
    expect(parsed.success).toBe(true);
  });

  it("parses fee policy envelope", () => {
    const parsed = feePolicyEnvelopeSchema.safeParse({
      data: {
        policyVersion: "LAUNCH_FEE_POLICY_V1",
        scope: "GLOBAL",
        transactionPercentBps: 300,
        transactionFixedIdr: 700,
        withdrawalPercentBps: 300,
        minimumWithdrawalIdr: 50_000,
        immutable: true,
        currency: "IDR",
        adminMutationAllowed: false,
      },
      meta,
    });
    expect(parsed.success).toBe(true);
  });

  it("parses status + auth login envelopes", () => {
    expect(
      statusEnvelopeSchema.safeParse({
        data: {
          service: "api",
          version: "0.0.1",
          appEnv: "local",
          uptimeSeconds: 12,
        },
        meta,
      }).success,
    ).toBe(true);

    expect(
      authLoginEnvelopeSchema.safeParse({
        data: {
          sessionId: "sess_1",
          csrfToken: "csrf_1",
          mfaRequired: false,
        },
        meta,
      }).success,
    ).toBe(true);
  });
});

describe("catalog mappers (DTO → view)", () => {
  it("maps product DTO to CatalogProduct view model", () => {
    const view = mapCatalogProductDto(sampleProduct);
    expect(view).toMatchObject({
      id: "prod_01",
      slug: "ai-prompt-pack",
      price: 149_000,
      type: "download",
    });
  });

  it("fails closed on unknown product type in mapper path", () => {
    expect(() =>
      mapCatalogProductDto({
        ...sampleProduct,
        // force past schema for unit isolation
        type: "download",
      }),
    ).not.toThrow();

    expect(() =>
      mapCatalogProductDto({
        ...sampleProduct,
        type: "unknown" as "download",
      }),
    ).toThrow(ApiError);

    try {
      mapCatalogProductDto({
        ...sampleProduct,
        type: "unknown" as "download",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (error instanceof ApiError) {
        expect(error.problem.code).toBe("INVALID_API_CONTRACT");
        expect(JSON.stringify(error.problem)).not.toMatch(/password|secret/i);
      }
    }
  });

  it("maps storefront DTO and preserves product list", () => {
    const view = mapPublicStorefrontDto({
      slug: "atelier",
      name: "Atelier",
      monogram: "A",
      bio: "Bio",
      preset: "atelier",
      layout: "grid",
      font: "modern",
      hero: "statement",
      cards: "soft",
      texture: "none",
      radius: "soft",
      headerAlign: "left",
      products: [sampleProduct],
      sections: ["products", "reviews"],
    });
    expect(view.preset).toBe("atelier");
    expect(view.products).toHaveLength(1);
    expect(view.products[0]?.type).toBe("download");
  });

  it("mock characterization product remains a valid view after identity mapping", () => {
    const demo = demoProducts[0];
    expect(demo).toBeDefined();
    if (!demo) return;
    const dto = {
      id: demo.id,
      slug: demo.slug,
      title: demo.title,
      short: demo.short,
      description: demo.description,
      price: demo.price,
      type: demo.type,
      sales: demo.sales,
      palette: demo.palette,
      glyph: demo.glyph,
      includes: demo.includes,
      badge: demo.badge,
      allowPayWhatYouWant: demo.allowPayWhatYouWant,
      minimumPrice: demo.minimumPrice,
      updatesEnabled: demo.updatesEnabled,
      currentVersion: demo.currentVersion,
    };
    const mapped = mapCatalogProductDto(dto);
    expect(mapped.id).toBe(demo.id);
    expect(mapped.price).toBe(demo.price);
    expect(mapped.type).toBe(demo.type);
  });

  it("mock storefront slug maps when DTO fields present", () => {
    const store =
      getDemoStorefront("asep-ai-tools") ||
      getDemoStorefront("designkit-studio");
    if (!store) {
      throw new Error("expected demo storefront fixture");
    }
    const dto = {
      slug: store.slug,
      name: store.name,
      monogram: store.monogram,
      bio: store.bio,
      tagline: store.tagline,
      verified: store.verified,
      accent: store.accent,
      ink: store.ink,
      canvas: store.canvas,
      preset: store.preset,
      layout: store.layout,
      font: store.font,
      hero: store.hero,
      cards: store.cards,
      texture: store.texture,
      radius: store.radius,
      headerAlign: store.headerAlign,
      announcement: store.announcement,
      featuredProductIds: store.featuredProductIds,
      sections: store.sections,
      socials: store.socials as Record<string, string>,
      trustBadges: store.trustBadges,
      rating: store.rating,
      reviewCount: store.reviewCount,
      products: store.products.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        short: p.short,
        description: p.description,
        price: p.price,
        type: p.type,
        sales: p.sales,
        palette: p.palette,
        glyph: p.glyph,
        includes: p.includes,
        badge: p.badge,
      })),
    };
    const mapped = mapPublicStorefrontDto(dto);
    expect(mapped.slug).toBe(store.slug);
    expect(mapped.products.length).toBe(store.products.length);
  });
});
