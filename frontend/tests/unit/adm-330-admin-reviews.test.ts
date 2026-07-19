import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminReviewDtoSchema,
  adminReviewModerateDataSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import { claimsHavePermission } from "@/features/admin/config/permissions";
import {
  demoAdminReviews,
  getAdminReview,
  listAdminReviews,
  listAdminReviewsPage,
  moderateAdminReview,
} from "@/features/admin/data";
import {
  humanizeAdminReviewStatus,
  mapAdminReviewDto,
  toAdminReviewStatusWire,
} from "@/features/admin/data/mappers";
import { queryKeys } from "@/shared/query/query-keys";

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
  requestId: "req_adm330",
  timestamp: "2026-07-17T12:00:00Z",
  hasMore: false,
  nextCursor: null,
};

const sampleReview = {
  id: "rev_live",
  productId: "prod_01",
  product: "AI Prompt Pack",
  seller: "Asep AI Tools",
  buyer: "Nadia Putri",
  initials: "NP",
  rating: 5,
  title: "Bagus",
  body: "Body",
  verified: true,
  status: "PENDING",
  createdAt: "2026-07-12T00:00:00Z",
  sellerReply: "Thanks",
};

describe("ADM-330 admin review moderation", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("maps wire review status to existing AdminStatus labels", () => {
    expect(humanizeAdminReviewStatus("PUBLISHED")).toBe("Published");
    expect(humanizeAdminReviewStatus("PENDING")).toBe("Pending moderation");
    expect(humanizeAdminReviewStatus("NEEDS_EDIT")).toBe("Needs edit");
    expect(humanizeAdminReviewStatus("REMOVED")).toBe("Removed");
    expect(toAdminReviewStatusWire("Published")).toBe("PUBLISHED");
    expect(toAdminReviewStatusWire("Pending moderation")).toBe("PENDING");
    expect(toAdminReviewStatusWire("Needs edit")).toBe("NEEDS_EDIT");
    expect(toAdminReviewStatusWire("Removed")).toBe("REMOVED");
    expect(toAdminReviewStatusWire("bogus")).toBeNull();
  });

  it("maps admin review DTO with humanized status and optional reply", () => {
    const view = mapAdminReviewDto(adminReviewDtoSchema.parse(sampleReview));
    expect(view.id).toBe("rev_live");
    expect(view.status).toBe("Pending moderation");
    expect(view.sellerReply).toBe("Thanks");
    expect(view.rating).toBe(5);
  });

  it("permission deny: reviews.read for list; reviews.moderate for mutation", () => {
    expect(claimsHavePermission(["orders.read"], "reviews.read")).toBe(false);
    expect(claimsHavePermission(["reviews.read"], "reviews.moderate")).toBe(
      false,
    );
    expect(claimsHavePermission(["reviews.moderate"], "reviews.moderate")).toBe(
      true,
    );
    expect(claimsHavePermission(["reviews.read"], "reviews.read")).toBe(true);
    expect(claimsHavePermission(null, "reviews.read")).toBe(false);
    expect(claimsHavePermission(["*"], "reviews.read")).toBe(true);
  });

  it("mock path never hits transport for list/detail/moderate", async () => {
    installMockAdmin();
    const list = await listAdminReviews();
    expect(list.length).toBeGreaterThan(0);
    expect(demoAdminReviews().length).toBe(list.length);
    const page = await listAdminReviewsPage({ limit: 2 });
    expect(page.items.length).toBeLessThanOrEqual(2);
    const detail = await getAdminReview(list[0]!.id);
    expect(detail?.id).toBe(list[0]!.id);
    const moderated = await moderateAdminReview({
      reviewId: list[0]!.id,
      status: "Published",
      reason: "Approve verified purchase review after spot check",
    });
    expect(moderated.displayStatus).toBe("Published");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api list uses GET /v1/admin/reviews with schema mapping", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: [sampleReview],
      meta,
    });
    const rows = await listAdminReviews({ limit: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("Pending moderation");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/reviews",
      expect.objectContaining({
        query: expect.objectContaining({ limit: 50 }),
      }),
    );
  });

  it("api detail uses GET /v1/admin/reviews/{id}", async () => {
    installApiAdmin();
    apiRequestMock.mockResolvedValueOnce({
      data: { ...sampleReview, status: "PUBLISHED" },
      meta,
    });
    const row = await getAdminReview("rev_live");
    expect(row?.status).toBe("Published");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/reviews/rev_live",
      expect.objectContaining({}),
    );
  });

  it("api moderate posts typed transition with wire status + reason", async () => {
    installApiAdmin();
    const body = adminReviewModerateDataSchema.parse({
      id: "rev_live",
      status: "REMOVED",
      productId: "prod_01",
    });
    apiRequestMock.mockResolvedValueOnce({
      data: body,
      meta,
    });
    const result = await moderateAdminReview({
      reviewId: "rev_live",
      status: "Removed",
      reason: "Remove abusive content after seller report review",
      productId: "prod_01",
      idempotencyKey: "idem_adm330",
    });
    expect(result.displayStatus).toBe("Removed");
    expect(result.productId).toBe("prod_01");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/admin/reviews/rev_live/transition",
      expect.objectContaining({
        method: "POST",
        body: {
          status: "REMOVED",
          reason: "Remove abusive content after seller report review",
        },
        idempotencyKey: "idem_adm330",
        auditReason: "Remove abusive content after seller report review",
      }),
    );
  });

  it("rejects short reason and invalid status without transport", async () => {
    installApiAdmin();
    await expect(
      moderateAdminReview({
        reviewId: "rev_x",
        status: "Published",
        reason: "too short",
      }),
    ).rejects.toThrow(/12 characters/);
    await expect(
      moderateAdminReview({
        reviewId: "rev_x",
        status: "Unknown",
        reason: "Valid reason length for audit trail here",
      }),
    ).rejects.toThrow(/status must be/);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("admin reviews query key is bounded and filter-scoped", () => {
    expect(queryKeys.admin.reviews({ status: "PENDING" })).toEqual([
      "admin",
      "reviews",
      "bounded",
      { status: "PENDING" },
    ]);
  });
});
