import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import {
  buyerCreateReviewRequestSchema,
  buyerPatchReviewRequestSchema,
  buyerReviewDtoSchema,
  buyerReviewEnvelopeSchema,
} from "@/shared/api/schemas";
import { mapBuyerReviewDto } from "@/features/buyer/data/mappers";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";

const meta = {
  requestId: "req_buy110",
  timestamp: "2026-07-17T10:00:00Z",
};

const reviewDto = {
  id: "rev_01",
  storeId: "store_1",
  productId: "prod_01",
  orderId: "01HQ0ORDER000000000000001",
  orderItemId: "oi_1",
  rating: 5,
  title: "Bagus",
  body: "Delivered product works",
  status: "PUBLISHED",
  verifiedPurchase: true,
  contentVersion: 1,
  createdAt: "2026-07-12T08:00:00Z",
  updatedAt: "2026-07-12T08:00:00Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": "req_buy110",
    },
  });
}

function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      problem: {
        code,
        message: "error",
        requestId: "req_buy110",
      },
    },
    status,
  );
}

afterEach(() => {
  clearDomainSourceSnapshot();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadApiMode() {
  vi.resetModules();
  const domain = await import("@/shared/data/domain-source");
  vi.spyOn(domain, "shouldUseMockFixtures").mockReturnValue(false);
  vi.spyOn(domain, "getDomainSource").mockReturnValue("api");
  return import("@/features/buyer/data/api");
}

describe("BUY-110 buyer review schemas", () => {
  it("parses create request exact fields (no status)", () => {
    const parsed = buyerCreateReviewRequestSchema.parse({
      orderItemId: "oi_1",
      rating: 5,
      title: "Bagus",
      body: "Works",
      productId: "prod_01",
    });
    expect(parsed.orderItemId).toBe("oi_1");
    expect(parsed.rating).toBe(5);
    expect(
      buyerCreateReviewRequestSchema.safeParse({
        orderItemId: "oi_1",
        rating: 6,
      }).success,
    ).toBe(false);
  });

  it("parses patch request with expectedVersion only (no rebinding)", () => {
    const parsed = buyerPatchReviewRequestSchema.parse({
      expectedVersion: 1,
      rating: 4,
      body: "Updated",
    });
    expect(parsed.expectedVersion).toBe(1);
    expect(buyerPatchReviewRequestSchema.safeParse({ rating: 4 }).success).toBe(
      false,
    );
  });

  it("parses buyer review DTO + envelope", () => {
    expect(buyerReviewDtoSchema.parse(reviewDto).id).toBe("rev_01");
    const env = buyerReviewEnvelopeSchema.parse({ data: reviewDto, meta });
    expect(env.data.contentVersion).toBe(1);
  });
});

describe("BUY-110 mapBuyerReviewDto", () => {
  it("maps server fields without inventing publish status", () => {
    const view = mapBuyerReviewDto(reviewDto);
    expect(view).toMatchObject({
      id: "rev_01",
      orderItemId: "oi_1",
      productId: "prod_01",
      rating: 5,
      title: "Bagus",
      body: "Delivered product works",
      status: "PUBLISHED",
      verifiedPurchase: true,
      contentVersion: 1,
    });
  });

  it("keeps pending moderation status from server", () => {
    const view = mapBuyerReviewDto({
      ...reviewDto,
      status: "PENDING_MODERATION",
    });
    expect(view.status).toBe("PENDING_MODERATION");
  });
});

describe("BUY-110 query keys ownership boundary", () => {
  it("isolates review keys by subject and order item", () => {
    const a = queryKeys.buyer.review("usr_a:ses_1", "oi_1");
    const b = queryKeys.buyer.review("usr_b:ses_2", "oi_1");
    expect(a).toEqual(["buyer", "usr_a:ses_1", "reviews", "oi_1"]);
    expect(a).not.toEqual(b);
  });

  it("builds public product review invalidation keys", () => {
    expect(queryKeys.public.productReviews("prod_01")).toEqual([
      "public",
      "products",
      "prod_01",
      "reviews",
    ]);
    expect(queryKeys.public.productReviewSummary("prod_01")).toEqual([
      "public",
      "products",
      "prod_01",
      "reviews",
      "summary",
    ]);
  });
});

describe("BUY-110 createBuyerReview adapter", () => {
  it("mock path returns fixture without network", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { createBuyerReview, isBuyerReviewApiDomain } =
      await import("@/features/buyer/data/api");
    expect(isBuyerReviewApiDomain()).toBe(false);
    const review = await createBuyerReview({
      orderItemId: "oi_mock",
      rating: 5,
      title: "Mock",
      body: "Local",
      productId: "prod_01",
    });
    expect(review.id).toBe("rev_mock_oi_mock");
    expect(review.verifiedPurchase).toBe(true);
    expect(review.contentVersion).toBe(1);
  });

  it("api create posts exact body and maps response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: reviewDto, meta }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const { createBuyerReview, isBuyerReviewApiDomain } = await loadApiMode();
    expect(isBuyerReviewApiDomain()).toBe(true);
    const review = await createBuyerReview({
      orderItemId: "oi_1",
      rating: 5,
      title: "Bagus",
      body: "Delivered product works",
      productId: "prod_01",
    });
    expect(review.id).toBe("rev_01");
    expect(review.verifiedPurchase).toBe(true);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/buyer/reviews");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      orderItemId: "oi_1",
      rating: 5,
      title: "Bagus",
      body: "Delivered product works",
      productId: "prod_01",
    });
    expect(body.status).toBeUndefined();
  });

  it("api ownership deny (404) rethrows for non-owner create", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
        ),
    );
    const { createBuyerReview } = await loadApiMode();
    await expect(
      createBuyerReview({ orderItemId: "foreign_oi", rating: 5, body: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("api not eligible (403) rethrows — no fake success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(problemResponse(403, "REVIEW_NOT_ELIGIBLE")),
    );
    const { createBuyerReview } = await loadApiMode();
    await expect(
      createBuyerReview({ orderItemId: "oi_1", rating: 5, body: "x" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("BUY-110 patchBuyerReview adapter", () => {
  it("api patch sends expectedVersion and maps updated review", async () => {
    const patched = {
      ...reviewDto,
      rating: 4,
      body: "Updated body",
      contentVersion: 2,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: patched, meta }));
    vi.stubGlobal("fetch", fetchMock);

    const { patchBuyerReview } = await loadApiMode();
    const review = await patchBuyerReview({
      reviewId: "rev_01",
      expectedVersion: 1,
      rating: 4,
      body: "Updated body",
    });
    expect(review.contentVersion).toBe(2);
    expect(review.rating).toBe(4);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/v1/buyer/reviews/rev_01");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      expectedVersion: 1,
      rating: 4,
      body: "Updated body",
    });
  });

  it("api version conflict (409) rethrows so UI keeps draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(problemResponse(409, PROBLEM_CODES.CONFLICT)),
    );
    const { patchBuyerReview } = await loadApiMode();
    await expect(
      patchBuyerReview({
        reviewId: "rev_01",
        expectedVersion: 1,
        body: "Stale edit",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("cross-buyer patch 404 rethrows (safe not-found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          problemResponse(404, PROBLEM_CODES.RESOURCE_NOT_FOUND),
        ),
    );
    const { patchBuyerReview } = await loadApiMode();
    await expect(
      patchBuyerReview({
        reviewId: "rev_foreign",
        expectedVersion: 1,
        body: "Hijack",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("mock patch increments contentVersion", async () => {
    installDomainSourceSnapshot(
      evaluateDomainSources({
        stage: "prototype",
        bootstrapSource: "mock",
      }),
    );
    const { patchBuyerReview } = await import("@/features/buyer/data/api");
    const review = await patchBuyerReview({
      reviewId: "rev_mock",
      expectedVersion: 1,
      rating: 3,
      body: "Edited",
    });
    expect(review.contentVersion).toBe(2);
    expect(review.rating).toBe(3);
  });
});

describe("BUY-110 purchase detail maps orderItemId for review create", () => {
  it("detail mapper exposes orderItemId", async () => {
    const { mapBuyerPurchaseDetailDto } =
      await import("@/features/buyer/data/mappers");
    const view = mapBuyerPurchaseDetailDto({
      orderId: "01HQ0ORDER000000000000001",
      orderNumber: "FRS-240712-1842",
      storeId: "store_1",
      storeName: "Asep AI Tools",
      storeSlug: "asep-ai-tools",
      paymentStatus: "PAID",
      grossIdr: 79_000,
      createdAt: "2026-07-12T07:33:00Z",
      paidAt: "2026-07-12T07:33:00Z",
      items: [
        {
          orderItemId: "oi_1",
          productId: "prod_01",
          productTitle: "AI Prompt Pack",
          unitPriceIdr: 79_000,
          quantity: 1,
          lineTotalIdr: 79_000,
          deliveryKind: "DOWNLOAD",
        },
      ],
    });
    expect(view.orderItemId).toBe("oi_1");
    expect(view.productId).toBe("prod_01");
  });
});

describe("BUY-110 version-update control disposition", () => {
  it("api purchase never enables sellerUpdates (no fake version command)", async () => {
    const { mapBuyerPurchaseDetailDto } =
      await import("@/features/buyer/data/mappers");
    const view = mapBuyerPurchaseDetailDto({
      orderId: "01HQ0ORDER000000000000001",
      orderNumber: "FRS-1",
      storeId: "store_1",
      paymentStatus: "PAID",
      grossIdr: 10_000,
      createdAt: "2026-07-12T07:33:00Z",
      items: [
        {
          orderItemId: "oi_1",
          productId: "prod_01",
          productTitle: "X",
          unitPriceIdr: 10_000,
          quantity: 1,
          lineTotalIdr: 10_000,
          deliveryKind: "DOWNLOAD",
          productVersion: "v1",
        },
      ],
    });
    // Disposition: DISABLED until BE freezes version-entitlement command
    expect(view.sellerUpdatesEnabled).toBe(false);
    expect(view.updateAvailable).toBeUndefined();
  });
});
