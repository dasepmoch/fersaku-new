import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import {
  checkoutIntentDtoSchema,
  checkoutIntentEnvelopeSchema,
  createCheckoutIntentRequestSchema,
} from "@/shared/api/schemas";
import { CHECKOUT_QR_WALLET_SEMANTICS } from "@/features/commerce/checkout/contracts";
import {
  mapCheckoutIntentDto,
  toCreateCheckoutIntentRequestBody,
} from "@/features/commerce/checkout/mappers";
import {
  createIdempotencyIntentHolder,
  createPendingDedupe,
  isOpaqueIdempotencyKey,
} from "@/shared/query/mutation-policy";

const meta = {
  requestId: "req_chk110",
  timestamp: "2026-07-17T10:00:00Z",
};

const sampleIntentDto = {
  paymentIntentId: "pi_chk110_01",
  orderId: "ord_chk110_01",
  orderNumber: "FRS-240717-0001",
  status: "PENDING" as const,
  source: "STOREFRONT",
  paymentMode: "SANDBOX",
  currency: "IDR",
  amount: 100_000,
  subtotal: 100_000,
  discount: 0,
  tip: 0,
  fee: 3_700,
  merchantNet: 96_300,
  gross: 100_000,
  expiresAt: "2026-07-17T11:00:00Z",
  qrString: "000201010212...",
  qrImageUrl: null,
  publicToken: "ptok_once",
  replayed: false,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("CHK-110 intent schemas", () => {
  it("accepts identifiers + buyer + selections without total authority", () => {
    const parsed = createCheckoutIntentRequestSchema.safeParse({
      storeId: "store_1",
      productId: "prod_01",
      payWhatYouWant: 100_000,
      tip: 10_000,
      upsellProductIds: ["prod_upsell"],
      buyerEmail: "buyer@example.test",
      buyerName: "Buyer",
    });
    expect(parsed.success).toBe(true);
  });

  it("parses CheckoutIntent envelope", () => {
    const parsed = checkoutIntentEnvelopeSchema.safeParse({
      data: sampleIntentDto,
      meta,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects fractional money on intent", () => {
    const parsed = checkoutIntentDtoSchema.safeParse({
      ...sampleIntentDto,
      amount: 100_000.5,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("CHK-110 mappers — request body strict, no client total", () => {
  it("request body never includes gross/total as authority", () => {
    const body = toCreateCheckoutIntentRequestBody({
      storeId: "store_1",
      productId: "prod_01",
      buyer: { name: "Asep", email: "a@example.test" },
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      payWhatYouWant: 100_000,
      tip: 10_000,
      upsellProductIds: ["prod_upsell"],
    });
    expect(body).toEqual({
      storeId: "store_1",
      productId: "prod_01",
      buyerEmail: "a@example.test",
      buyerName: "Asep",
      payWhatYouWant: 100_000,
      tip: 10_000,
      upsellProductIds: ["prod_upsell"],
    });
    expect(body).not.toHaveProperty("gross");
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("unitPrice");
    expect(body).not.toHaveProperty("idempotencyKey");
  });

  it("maps intent DTO to view model; amount/gross authority", () => {
    const intent = mapCheckoutIntentDto(sampleIntentDto);
    expect(intent.paymentIntentId).toBe("pi_chk110_01");
    expect(intent.orderId).toBe("ord_chk110_01");
    expect(intent.status).toBe("PENDING");
    expect(intent.amount).toBe(100_000);
    expect(intent.gross).toBe(100_000);
    expect(intent.publicToken).toBe("ptok_once");
    expect(intent.replayed).toBe(false);
  });

  it("fails closed on unsafe money", () => {
    expect(() =>
      mapCheckoutIntentDto({
        ...sampleIntentDto,
        amount: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow(ApiError);
  });
});

describe("CHK-110 createCheckoutIntent API", () => {
  it("api path posts to /v1/checkout/intents with Idempotency-Key", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest").mockResolvedValue({
      data: sampleIntentDto,
      meta,
    } as never);

    const { createCheckoutIntent } = await import(
      "@/features/commerce/checkout/api"
    );
    const key = "22222222-2222-4222-8222-222222222222";
    const intent = await createCheckoutIntent({
      storeId: "store_live",
      productId: "prod_01",
      buyer: { name: "Buyer", email: "b@example.test" },
      idempotencyKey: key,
      tip: 5_000,
    });

    expect(intent.paymentIntentId).toBe("pi_chk110_01");
    expect(intent.status).toBe("PENDING");
    expect(spy).toHaveBeenCalledWith(
      "/v1/checkout/intents",
      expect.objectContaining({
        method: "POST",
        idempotencyKey: key,
        body: expect.objectContaining({
          storeId: "store_live",
          productId: "prod_01",
          buyerEmail: "b@example.test",
          buyerName: "Buyer",
          tip: 5_000,
        }),
      }),
    );
    const body = (spy.mock.calls[0]?.[1] as { body?: Record<string, unknown> })
      ?.body;
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("gross");
    spy.mockRestore();
  });

  it("createCheckoutIntent rejects mock domain", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(true);

    const { createCheckoutIntent } = await import(
      "@/features/commerce/checkout/api"
    );
    await expect(
      createCheckoutIntent({
        storeId: "s",
        productId: "p",
        buyer: { name: "N", email: "n@example.test" },
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toThrow(/api-only|mock/i);
  });

  it("simulateCheckoutPayment remains mock-only and never hits live routes", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(true);

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest");

    const { simulateCheckoutPayment } = await import(
      "@/features/commerce/checkout/api"
    );
    const result = await simulateCheckoutPayment({
      productId: "prod_01",
      storeSlug: "asep-ai-tools",
      customer: { name: "A", email: "a@example.test" },
      total: 1,
      tip: 0,
      upsell: false,
    });
    expect(result.accepted).toBe(true);
    expect(result.orderId).toBe("FRS-240712-1848");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("simulateCheckoutPayment throws on api domain (no live simulate)", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest");

    const { simulateCheckoutPayment } = await import(
      "@/features/commerce/checkout/api"
    );
    await expect(
      simulateCheckoutPayment({
        productId: "prod_01",
        storeSlug: "asep",
        customer: { name: "A", email: "a@example.test" },
        total: 99,
        tip: 0,
        upsell: false,
      }),
    ).rejects.toThrow(/mock-only|createCheckoutIntent/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("create failure does not yield success intent", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    vi.spyOn(http, "apiRequest").mockRejectedValue(
      new ApiError(400, {
        code: "VALIDATION_FAILED",
        message: "invalid product",
        requestId: "req_fail",
      }),
    );

    const { createCheckoutIntent } = await import(
      "@/features/commerce/checkout/api"
    );
    let intent: unknown = null;
    let failed = false;
    try {
      intent = await createCheckoutIntent({
        storeId: "s",
        productId: "p",
        buyer: { name: "N", email: "n@example.test" },
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(intent).toBeNull();
  });
});

describe("CHK-110 double-click + idempotency key reuse", () => {
  it("pending dedupe blocks concurrent second click", () => {
    const gate = createPendingDedupe();
    expect(gate.tryBegin()).toBe(true);
    expect(gate.tryBegin()).toBe(false);
    expect(gate.isPending()).toBe(true);
    gate.end();
    expect(gate.tryBegin()).toBe(true);
  });

  it("idempotency holder reuses same opaque key until reset", () => {
    const holder = createIdempotencyIntentHolder();
    const k1 = holder.getKey();
    const k2 = holder.getKey();
    expect(k1).toBe(k2);
    expect(isOpaqueIdempotencyKey(k1)).toBe(true);
    expect(k1).not.toMatch(/@|email|store|amount/i);

    holder.reset();
    const k3 = holder.getKey();
    expect(k3).not.toBe(k1);
    expect(isOpaqueIdempotencyKey(k3)).toBe(true);
  });

  it("retry reuses key; body fingerprint conflict is local (no auto-rotate)", () => {
    const holder = createIdempotencyIntentHolder();
    const bodyA = { storeId: "s", productId: "p", tip: 0 };
    holder.bindBody(bodyA);
    const key = holder.getKey();
    const reuse = holder.resolveSend(bodyA);
    expect(reuse).toEqual({ action: "reuse", key });

    const conflict = holder.resolveSend({
      storeId: "s",
      productId: "p",
      tip: 10_000,
    });
    expect(conflict.action).toBe("conflict_local");
    expect(conflict.key).toBe(key);
  });

  it("api create reuses same Idempotency-Key on second call (timeout recovery)", async () => {
    vi.resetModules();
    const domain = await import("@/shared/data/domain-source");
    vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
    vi.spyOn(domain, "getDomainSource").mockReturnValue("api");

    const http = await import("@/shared/api/http-client");
    const spy = vi.spyOn(http, "apiRequest").mockResolvedValue({
      data: { ...sampleIntentDto, replayed: true },
      meta,
    } as never);

    const { createCheckoutIntent } = await import(
      "@/features/commerce/checkout/api"
    );
    const holder = createIdempotencyIntentHolder();
    const key = holder.getKey();
    const input = {
      storeId: "store_live",
      productId: "prod_01",
      buyer: { name: "Buyer", email: "b@example.test" },
      idempotencyKey: key,
    };

    const first = await createCheckoutIntent(input);
    const second = await createCheckoutIntent({
      ...input,
      idempotencyKey: holder.getKey(),
    });

    expect(first.paymentIntentId).toBe(second.paymentIntentId);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ idempotencyKey: key }),
    );
    expect(spy.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ idempotencyKey: key }),
    );
    spy.mockRestore();
  });
});

describe("CHK-110 disposition freeze", () => {
  it("pay button is create-intent; stock internal; unknown → lookup recovery", () => {
    expect(CHECKOUT_QR_WALLET_SEMANTICS.payButton).toMatch(
      /createCheckoutIntent/i,
    );
    expect(CHECKOUT_QR_WALLET_SEMANTICS.stockReservations).toMatch(
      /INTERNAL_ONLY/,
    );
    expect(CHECKOUT_QR_WALLET_SEMANTICS.unknownNetworkOutcome).toMatch(
      /LOOKUP_RECOVERY|same idempotency/i,
    );
    expect(CHECKOUT_QR_WALLET_SEMANTICS.continueButton).toMatch(
      /does NOT create payment intent/i,
    );
  });
});
