import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import {
  checkoutPriceDtoSchema,
  checkoutPriceEnvelopeSchema,
  checkoutQuoteRequestSchema,
} from "@/shared/api/schemas";
import {
  buildMockCheckoutQuote,
  clampIntegerIdr,
  mapCheckoutPriceDto,
  toCheckoutQuoteRequestBody,
} from "@/features/commerce/checkout/mappers";
import { CHECKOUT_QR_WALLET_SEMANTICS } from "@/features/commerce/checkout/contracts";
import { findDemoProduct, getDemoStorefront } from "@/features/catalog/mock";

const meta = {
  requestId: "req_chk100",
  timestamp: "2026-07-17T10:00:00Z",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("CHK-100 quote schemas", () => {
  it("accepts identifiers + selections without total", () => {
    const parsed = checkoutQuoteRequestSchema.safeParse({
      storeId: "store_1",
      productId: "prod_01",
      merchandise: 79_000,
      tip: 10_000,
      upsell: 39_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects fractional money", () => {
    const parsed = checkoutPriceDtoSchema.safeParse({
      merchandise: 79_000.5,
      discount: 0,
      gross: 79_000,
      couponApplied: false,
      clientDiscountIgnored: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("parses CheckoutPrice envelope", () => {
    const parsed = checkoutPriceEnvelopeSchema.safeParse({
      data: {
        storeId: "store_1",
        productId: "prod_01",
        merchandise: 100_000,
        tip: 10_000,
        upsell: 5_000,
        eligibleSubtotal: 100_000,
        discount: 20_000,
        gross: 95_000,
        couponApplied: true,
        clientDiscountIgnored: true,
      },
      meta,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("CHK-100 mappers — tampered total ignored", () => {
  it("request body never includes gross/total", () => {
    const body = toCheckoutQuoteRequestBody({
      storeId: "store_1",
      productId: "prod_01",
      merchandise: 79_000,
      tip: 10_000,
      upsell: 39_000,
    });
    expect(body).toEqual({
      storeId: "store_1",
      productId: "prod_01",
      merchandise: 79_000,
      tip: 10_000,
      upsell: 39_000,
    });
    expect(body).not.toHaveProperty("gross");
    expect(body).not.toHaveProperty("total");
  });

  it("maps server gross as authority; clientDiscount field only for ignore proof", () => {
    const body = toCheckoutQuoteRequestBody(
      { storeId: "s", productId: "p", merchandise: 100_000 },
      { clientDiscount: 99_999 },
    );
    expect(body.clientDiscount).toBe(99_999);
    expect(body).not.toHaveProperty("gross");

    const quote = mapCheckoutPriceDto({
      storeId: "s",
      productId: "p",
      merchandise: 100_000,
      tip: 10_000,
      upsell: 5_000,
      discount: 20_000,
      gross: 95_000,
      couponApplied: true,
      clientDiscountIgnored: true,
    });
    expect(quote.gross).toBe(95_000);
    expect(quote.clientDiscountIgnored).toBe(true);
    expect(quote.discount).toBe(20_000);
    // Tampered browser total would be e.g. 1 — display must use quote.gross
    const tamperedClientTotal = 1;
    expect(quote.gross).not.toBe(tamperedClientTotal);
  });

  it("mock quote ignores client discount and uses integer math", () => {
    const quote = buildMockCheckoutQuote(
      {
        storeId: "store_demo_asep_ai_tools",
        productId: "prod_01",
        merchandise: 100_000,
        tip: 10_000,
        upsell: 5_000,
      },
      79_000,
    );
    expect(quote.gross).toBe(115_000);
    expect(quote.discount).toBe(0);
    expect(quote.clientDiscountIgnored).toBe(true);
  });

  it("fails closed on unsafe money", () => {
    expect(() =>
      mapCheckoutPriceDto({
        merchandise: Number.MAX_SAFE_INTEGER + 1,
        discount: 0,
        gross: 0,
        couponApplied: false,
        clientDiscountIgnored: true,
      }),
    ).toThrow(ApiError);
  });
});

describe("CHK-100 product resolve bootstrap", () => {
  it("demo product/store carry storeId for quote", () => {
    const match = findDemoProduct("prod_01");
    expect(match).not.toBeNull();
    expect(match!.product.storeId).toBe("store_demo_asep_ai_tools");
    expect(match!.store.storeId).toBe("store_demo_asep_ai_tools");
    expect(match!.product.id).toBe("prod_01");
    expect(match!.store.slug).toBe("asep-ai-tools");
  });

  it("storefront products include storeId", () => {
    const store = getDemoStorefront("asep-ai-tools");
    expect(store?.storeId).toBe("store_demo_asep_ai_tools");
    expect(store?.products[0]?.storeId).toBe("store_demo_asep_ai_tools");
  });

  it("findPublicProduct mock path resolves product+store", async () => {
    const { findPublicProduct } = await import("@/features/catalog/api");
    const match = await findPublicProduct("prod_01");
    expect(match?.product.id).toBe("prod_01");
    expect(match?.store?.slug).toBe("asep-ai-tools");
    expect(match?.product.storeId || match?.store?.storeId).toBeTruthy();
  });
});

describe("CHK-100 requestCheckoutQuote — mock + API", () => {
  it("mock path returns server-shaped quote and ignores clientDiscount", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(true);

    const { requestCheckoutQuote } = await import(
      "@/features/commerce/checkout/api"
    );
    const quote = await requestCheckoutQuote(
      {
        storeId: "store_demo_asep_ai_tools",
        productId: "prod_01",
        merchandise: 79_000,
        tip: 10_000,
        upsell: 39_000,
      },
      { catalogPrice: 79_000, clientDiscount: 999_999 },
    );
    expect(quote.gross).toBe(128_000);
    expect(quote.clientDiscountIgnored).toBe(true);
    expect(quote.merchandise).toBe(79_000);
  });

  it("API path posts identifiers only and maps gross; ignores tampered clientDiscount in response authority", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest").mockResolvedValue({
      data: {
        storeId: "store_live",
        productId: "prod_01",
        merchandise: 100_000,
        tip: 10_000,
        upsell: 5_000,
        eligibleSubtotal: 100_000,
        discount: 20_000,
        gross: 95_000,
        couponApplied: true,
        clientDiscountIgnored: true,
      },
      meta,
    } as never);

    const { requestCheckoutQuote } = await import(
      "@/features/commerce/checkout/api"
    );
    const quote = await requestCheckoutQuote(
      {
        storeId: "store_live",
        productId: "prod_01",
        tip: 10_000,
        upsell: 5_000,
      },
      { clientDiscount: 99_999 },
    );

    expect(quote.gross).toBe(95_000);
    expect(quote.clientDiscountIgnored).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      "/v1/checkout/quote",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          storeId: "store_live",
          productId: "prod_01",
          tip: 10_000,
          upsell: 5_000,
          clientDiscount: 99_999,
        }),
      }),
    );
    const body = (spy.mock.calls[0]?.[1] as { body?: Record<string, unknown> })
      ?.body;
    expect(body).not.toHaveProperty("gross");
    expect(body).not.toHaveProperty("total");
    spy.mockRestore();
  });
});

describe("CHK-100 stale re-quote guard", () => {
  it("sequence guard: older response must not overwrite newer selection", async () => {
    let resolveSlow: (v: unknown) => void = () => {};
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    const calls: Array<{ tip: number; seq: number }> = [];
    let seq = 0;
    let applied: { tip: number; gross: number } | null = null;

    async function runQuote(tip: number) {
      const mySeq = ++seq;
      calls.push({ tip, seq: mySeq });
      const result =
        tip === 10_000
          ? await slow.then(() => ({ tip: 10_000, gross: 89_000 }))
          : { tip: 25_000, gross: 104_000 };
      if (mySeq !== seq) return; // stale
      applied = result;
    }

    const p1 = runQuote(10_000);
    const p2 = runQuote(25_000);
    await p2;
    resolveSlow(undefined);
    await p1;

    expect(applied).toEqual({ tip: 25_000, gross: 104_000 });
    expect(calls).toHaveLength(2);
  });
});

describe("CHK-100 UX integer bounds + disposition freeze", () => {
  it("clampIntegerIdr enforces minimum and truncates", () => {
    expect(clampIntegerIdr(50_000.9, 79_000)).toBe(79_000);
    expect(clampIntegerIdr(100_000.7, 79_000)).toBe(100_000);
    expect(clampIntegerIdr(Number.NaN, 79_000)).toBe(79_000);
  });

  it("documents coupon OUT-OF-SCOPE and stock-reservations internal-only", () => {
    expect(CHECKOUT_QR_WALLET_SEMANTICS.couponControl).toMatch(
      /OUT-OF-SCOPE|DISABLED/,
    );
    expect(CHECKOUT_QR_WALLET_SEMANTICS.stockReservations).toMatch(
      /INTERNAL_ONLY/,
    );
    expect(CHECKOUT_QR_WALLET_SEMANTICS.continueButton).toMatch(
      /does NOT create payment intent/i,
    );
  });
});
