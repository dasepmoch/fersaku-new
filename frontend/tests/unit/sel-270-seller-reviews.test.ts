import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SELLER_REVIEW_LIST_LIMIT,
  reportSellerReviewRequestSchema,
  sellerReviewDtoSchema,
  sellerReviewListEnvelopeSchema,
  sellerStoreReviewSummaryDtoSchema,
  upsertSellerReviewReplyRequestSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/http-client";
import {
  fiveStarSharePercent,
  formatAverageRating,
  mapSellerReviewDto,
  mapSellerStoreReviewSummaryDto,
  reviewDistributionWidthPercent,
  verifiedSharePercent,
} from "@/features/seller/reviews/mappers";
import type { SellerReview } from "@/features/seller/reviews/contracts";
import { DEMO_STORE_ID } from "@/shared/config/demo";

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
  requestId: "req_sel270",
  timestamp: "2026-07-17T10:00:00Z",
  hasMore: false,
};

const listRow = {
  id: "rev_live_01",
  storeId: "store_live",
  productId: "prod_live",
  productTitle: "AI Prompt Pack",
  sellerName: "Asep AI Tools",
  buyerDisplay: "Nadia Putri",
  rating: 5,
  title: "Bagus",
  body: "Sangat membantu",
  status: "PUBLISHED",
  verifiedPurchase: true,
  contentVersion: 1,
  createdAt: "2026-07-12T07:33:00Z",
  updatedAt: "2026-07-12T07:33:00Z",
  sellerReply: null,
  replyContentVersion: null,
};

const summaryDto = {
  storeId: "store_live",
  count: 10,
  averageRating: 4.5,
  rating1: 0,
  rating2: 1,
  rating3: 1,
  rating4: 2,
  rating5: 6,
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

function viewReview(overrides: Partial<SellerReview> = {}): SellerReview {
  return {
    id: "rev_1",
    productId: "p1",
    product: "P",
    seller: "S",
    buyer: "Buyer",
    initials: "B",
    rating: 5,
    title: "T",
    body: "B",
    verified: true,
    status: "Published",
    createdAt: "now",
    ...overrides,
  };
}

describe("SEL-270 schemas", () => {
  it("accepts seller review list envelope", () => {
    expect(sellerReviewDtoSchema.safeParse(listRow).success).toBe(true);
    const env = sellerReviewListEnvelopeSchema.safeParse({
      data: [listRow],
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("accepts store summary aggregate", () => {
    expect(
      sellerStoreReviewSummaryDtoSchema.safeParse(summaryDto).success,
    ).toBe(true);
  });

  it("reply request requires body; expectedVersion optional", () => {
    expect(
      upsertSellerReviewReplyRequestSchema.safeParse({ body: "Thanks" })
        .success,
    ).toBe(true);
    expect(
      upsertSellerReviewReplyRequestSchema.safeParse({
        body: "Thanks",
        expectedVersion: 2,
      }).success,
    ).toBe(true);
    expect(
      upsertSellerReviewReplyRequestSchema.safeParse({ body: "" }).success,
    ).toBe(false);
  });

  it("report request requires reasonCode enum", () => {
    expect(
      reportSellerReviewRequestSchema.safeParse({ reasonCode: "OTHER" })
        .success,
    ).toBe(true);
    expect(
      reportSellerReviewRequestSchema.safeParse({ reasonCode: "SPAM" }).success,
    ).toBe(true);
    expect(
      reportSellerReviewRequestSchema.safeParse({ reasonCode: "HACK" }).success,
    ).toBe(false);
  });

  it("documents bounded list limit", () => {
    expect(SELLER_REVIEW_LIST_LIMIT).toBe(50);
  });
});

describe("SEL-270 mappers", () => {
  it("maps seller DTO to card model with initials and status", () => {
    const view = mapSellerReviewDto(listRow);
    expect(view.id).toBe("rev_live_01");
    expect(view.product).toBe("AI Prompt Pack");
    expect(view.buyer).toBe("Nadia Putri");
    expect(view.initials).toBe("NP");
    expect(view.status).toBe("Published");
    expect(view.verified).toBe(true);
    expect(view.sellerReply).toBeUndefined();
  });

  it("maps store summary without NaN widths", () => {
    const summary = mapSellerStoreReviewSummaryDto(summaryDto);
    expect(summary.total).toBe(10);
    expect(summary.average).toBe(4.5);
    expect(summary.distribution[5]).toBe(6);
    expect(reviewDistributionWidthPercent(summary, 5)).toBe(60);
    expect(fiveStarSharePercent(summary)).toBe("60%");
  });

  it("zero total never yields NaN percent", () => {
    const empty = mapSellerStoreReviewSummaryDto({
      storeId: "s",
      count: 0,
      averageRating: 0,
      rating1: 0,
      rating2: 0,
      rating3: 0,
      rating4: 0,
      rating5: 0,
    });
    expect(empty.average).toBe(0);
    expect(reviewDistributionWidthPercent(empty, 5)).toBe(0);
    expect(fiveStarSharePercent(empty)).toBe("0%");
    expect(formatAverageRating(0)).toBe("0");
    expect(verifiedSharePercent([])).toBe("0%");
  });

  it("verified share from list rows", () => {
    expect(
      verifiedSharePercent([
        viewReview({ verified: true }),
        viewReview({ verified: false }),
      ]),
    ).toBe("50%");
  });
});

describe("SEL-270 query keys", () => {
  it("includes store id for list and summary", () => {
    expect(queryKeys.seller.reviews("store_a")).toEqual([
      "seller",
      "store_a",
      "reviews",
    ]);
    expect(queryKeys.seller.reviewsSummary("store_b")).toEqual([
      "seller",
      "store_b",
      "reviews",
      "summary",
    ]);
    expect(queryKeys.seller.reviews("store_a")).not.toEqual(
      queryKeys.seller.reviews("store_b"),
    );
  });
});

describe("SEL-270 api adapters", () => {
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
      listSellerReviews,
      getSellerRatingSummary,
      upsertSellerReviewReply,
    } = await import("@/features/seller/reviews/api");
    const list = await listSellerReviews(DEMO_STORE_ID);
    const summary = await getSellerRatingSummary(DEMO_STORE_ID);
    const reply = await upsertSellerReviewReply(DEMO_STORE_ID, "rev_01", {
      body: "Thanks!",
    });
    expect(list.length).toBeGreaterThan(0);
    expect(summary.total).toBeGreaterThan(0);
    expect(reply.body).toBe("Thanks!");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list uses store-scoped path and maps rows", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: [listRow],
      meta,
    });
    const { listSellerReviews } = await import("@/features/seller/reviews/api");
    const list = await listSellerReviews("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/reviews",
      expect.objectContaining({
        query: { limit: SELLER_REVIEW_LIST_LIMIT },
      }),
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.buyer).toBe("Nadia Putri");
    expect(list[0]?.product).toBe("AI Prompt Pack");
  });

  it("api summary maps aggregate", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: summaryDto,
      meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
    });
    const { getSellerRatingSummary } =
      await import("@/features/seller/reviews/api");
    const summary = await getSellerRatingSummary("store_live");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/reviews/summary",
      expect.any(Object),
    );
    expect(summary.total).toBe(10);
    expect(summary.distribution[5]).toBe(6);
  });

  it("foreign store list rethrows resource_not_found (safe 404)", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      }),
    );
    const { listSellerReviews } = await import("@/features/seller/reviews/api");
    await expect(listSellerReviews("store_foreign")).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("reply PUT sends body and optional expectedVersion", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        reviewId: "rev_live_01",
        storeId: "store_live",
        body: "Terima kasih!",
        contentVersion: 1,
        createdAt: "2026-07-17T10:00:00Z",
        updatedAt: "2026-07-17T10:00:00Z",
      },
      meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
    });
    const { upsertSellerReviewReply } =
      await import("@/features/seller/reviews/api");
    const result = await upsertSellerReviewReply("store_live", "rev_live_01", {
      body: "Terima kasih!",
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/reviews/rev_live_01/reply",
      expect.objectContaining({
        method: "PUT",
        body: { body: "Terima kasih!" },
      }),
    );
    expect(result.contentVersion).toBe(1);
  });

  it("reply version conflict rethrows (draft kept by caller)", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(409, {
        code: "CONFLICT",
        message: "Reply version conflict",
      }),
    );
    const { upsertSellerReviewReply } =
      await import("@/features/seller/reviews/api");
    await expect(
      upsertSellerReviewReply("store_live", "rev_live_01", {
        body: "x",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("report POST defaults reason OTHER", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        id: "rep_1",
        reviewId: "rev_live_01",
        reasonCode: "OTHER",
        status: "OPEN",
        createdAt: "2026-07-17T10:00:00Z",
      },
      meta: { requestId: "r", timestamp: "2026-07-17T10:00:00Z" },
    });
    const { reportSellerReview } =
      await import("@/features/seller/reviews/api");
    const result = await reportSellerReview("store_live", "rev_live_01");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/reviews/rev_live_01/report",
      expect.objectContaining({
        method: "POST",
        body: { reasonCode: "OTHER" },
      }),
    );
    expect(result.status).toBe("OPEN");
  });

  it("report foreign review rethrows 404", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(404, {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      }),
    );
    const { reportSellerReview } =
      await import("@/features/seller/reviews/api");
    await expect(
      reportSellerReview("store_live", "rev_other"),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("encodes store id in path", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({ data: [], meta });
    const { listSellerReviews } = await import("@/features/seller/reviews/api");
    await listSellerReviews("store/with space");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store%2Fwith%20space/reviews",
      expect.any(Object),
    );
  });
});
