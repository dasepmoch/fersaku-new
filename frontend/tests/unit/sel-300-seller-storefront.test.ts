import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  storefrontDraftRequestSchema,
  storefrontPublishEnvelopeSchema,
  storefrontPublishRequestSchema,
  storefrontRevisionEnvelopeSchema,
  storefrontStudioEnvelopeSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  evaluateDomainSources,
  installDomainSourceSnapshot,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/http-client";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import { initialStorefrontConfig } from "@/features/seller/storefront/config";
import {
  getStorefrontStudio,
  publishStorefrontDraft,
  saveStorefrontDraft,
} from "@/features/seller/storefront/api";
import {
  formatStudioStatusLine,
  isStorefrontRevisionConflict,
  mapConfigDtoToBuilder,
  mapPublishDto,
  mapRevisionDto,
  mapStudioDto,
  parseStorefrontConflict,
  toStorefrontWireConfig,
} from "@/features/seller/storefront/mappers";

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
  requestId: "req_sel300",
  timestamp: "2026-07-17T10:00:00Z",
};

const draftConfig = {
  template: "Atelier",
  preset: "atelier",
  name: "Live Tools",
  tagline: "Ship faster",
  bio: "API-backed storefront",
  announcement: "Launch week",
  announcementEnabled: true,
  accent: "#d7ff64",
  ink: "#173f2c",
  canvas: "#f4f2eb",
  layout: "grid",
  hero: "statement",
  cards: "soft",
  texture: "noise",
  radius: "round",
  font: "editorial",
  align: "left",
  headerAlign: "left",
  density: "comfortable",
  showSearch: true,
  showSales: true,
  showRatings: true,
  featuredIds: ["prod_live_1"],
  featuredProductIds: ["prod_live_1"],
  sections: [
    { id: "featured", label: "Produk unggulan", visible: true },
    { id: "products", label: "Semua produk", visible: true },
  ],
  trustBadges: ["QRIS"],
  instagram: "@live",
  website: "https://live.example",
  socials: { instagram: "@live", website: "https://live.example" },
  customLinks: [],
  seoTitle: "Live",
  seoDescription: "Live store",
  logoStyle: "spark",
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
  clearDomainSourceSnapshot();
});

afterEach(() => {
  clearDomainSourceSnapshot();
});

describe("SEL-300 schemas", () => {
  it("accepts studio envelope", () => {
    const env = storefrontStudioEnvelopeSchema.safeParse({
      data: {
        storeId: "store_live",
        draftRevision: 3,
        draftETag: 'W/"abc"',
        draftConfig,
        publishedRevision: 2,
      },
      meta,
    });
    expect(env.success).toBe(true);
  });

  it("accepts revision + publish envelopes", () => {
    expect(
      storefrontRevisionEnvelopeSchema.safeParse({
        data: {
          revision: 3,
          etag: 'W/"abc"',
          status: "draft",
          config: draftConfig,
        },
        meta,
      }).success,
    ).toBe(true);
    expect(
      storefrontPublishEnvelopeSchema.safeParse({
        data: {
          accepted: true,
          revision: 3,
          etag: 'W/"abc"',
          requestId: "req_1",
          storeId: "store_live",
        },
        meta,
      }).success,
    ).toBe(true);
  });

  it("draft/publish request require config object; no logoStyle root", () => {
    const draft = storefrontDraftRequestSchema.safeParse({
      config: { layout: "grid" },
      expectedRevision: 2,
      expectedETag: 'W/"x"',
    });
    expect(draft.success).toBe(true);
    const publish = storefrontPublishRequestSchema.safeParse({
      config: { layout: "grid" },
      expectedRevision: 2,
      expectedETag: 'W/"x"',
    });
    expect(publish.success).toBe(true);
    // Wire body builder must nest logoStyle under config only
    const wire = toStorefrontWireConfig(initialStorefrontConfig, "letter");
    expect(wire.logoStyle).toBe("letter");
    expect("storeId" in wire).toBe(false);
  });
});

describe("SEL-300 mappers", () => {
  it("maps public-shaped config to BuilderConfig", () => {
    const mapped = mapConfigDtoToBuilder({
      preset: "signal",
      layout: "editorial",
      headerAlign: "center",
      featuredProductIds: ["a", "b"],
      sections: ["products", "about"],
      socials: { instagram: "@x", website: "https://x.test" },
      tagline: "Hi",
      texture: "none",
    });
    expect(mapped.template).toBe("Signal");
    expect(mapped.layout).toBe("editorial");
    expect(mapped.align).toBe("center");
    expect(mapped.featuredIds).toEqual(["a", "b"]);
    expect(mapped.instagram).toBe("@x");
    expect(mapped.texture).toBe("clean");
    expect(mapped.sections.find((s) => s.id === "products")?.visible).toBe(
      true,
    );
  });

  it("maps studio/revision/publish DTOs", () => {
    const studio = mapStudioDto({
      storeId: "store_live",
      draftRevision: 5,
      draftETag: 'W/"e5"',
      draftConfig,
    });
    expect(studio.config.name).toBe("Live Tools");
    expect(studio.logoStyle).toBe("spark");
    expect(studio.draftRevision).toBe(5);

    const rev = mapRevisionDto({
      revision: 6,
      etag: 'W/"e6"',
      status: "draft",
      config: draftConfig,
    });
    expect(rev.revision).toBe(6);

    const pub = mapPublishDto({
      accepted: true,
      revision: 6,
      requestId: "req_p",
      etag: 'W/"e6"',
      storeId: "store_live",
    });
    expect(pub.accepted).toBe(true);
    expect(pub.requestId).toBe("req_p");
  });

  it("detects revision conflict and parses details without clearing draft", () => {
    const err = new ApiError(409, {
      code: PROBLEM_CODES.STOREFRONT_REVISION_CONFLICT,
      message: "conflict",
      details: {
        expectedRevision: 2,
        currentRevision: 4,
        currentETag: 'W/"cur"',
      },
    });
    expect(isStorefrontRevisionConflict(err)).toBe(true);
    const details = parseStorefrontConflict(err);
    expect(details?.currentRevision).toBe(4);
    expect(details?.currentETag).toBe('W/"cur"');
  });

  it("formats existing status line geometry strings", () => {
    expect(
      formatStudioStatusLine({
        revision: 14,
        savedAt: Date.now(),
        conflict: false,
        saving: false,
        dirty: false,
      }),
    ).toContain("Draft autosaved just now");
    expect(
      formatStudioStatusLine({
        revision: 3,
        savedAt: null,
        conflict: true,
        saving: false,
        dirty: true,
      }),
    ).toContain("Revision conflict");
  });
});

describe("SEL-300 query keys", () => {
  it("storefront key is store-scoped", () => {
    expect(queryKeys.seller.storefront("store_a")).toEqual([
      "seller",
      "store_a",
      "storefront",
    ]);
    expect(queryKeys.seller.storefront("store_a")).not.toEqual(
      queryKeys.seller.storefront("store_b"),
    );
  });
});

describe("SEL-300 adapters", () => {
  it("mock path: draft save + publish without network", async () => {
    installMockSeller();
    const draft = await saveStorefrontDraft({
      storeId: "store_demo_asep",
      config: initialStorefrontConfig,
      logoStyle: "letter",
      expectedRevision: 14,
      expectedETag: 'W/"mock"',
    });
    expect(draft.revision).toBe(14);
    expect(apiRequestMock).not.toHaveBeenCalled();

    const pub = await publishStorefrontDraft({
      storeId: "store_demo_asep",
      config: initialStorefrontConfig,
      logoStyle: "letter",
      expectedRevision: 14,
      expectedETag: 'W/"mock"',
    });
    expect(pub.accepted).toBe(true);
    expect(pub.requestId).toBe("mock_storefront_publish_001");
    expect(apiRequestMock).not.toHaveBeenCalled();

    const studio = await getStorefrontStudio("store_demo_asep");
    expect(studio.draftRevision).toBe(14);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("api path: GET studio maps draft", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        storeId: "store_live",
        draftRevision: 3,
        draftETag: 'W/"abc"',
        draftConfig,
        publishedRevision: 2,
      },
      meta,
    });
    const studio = await getStorefrontStudio("store_live");
    expect(studio.storeId).toBe("store_live");
    expect(studio.config.name).toBe("Live Tools");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/storefront",
      expect.objectContaining({
        schema: storefrontStudioEnvelopeSchema,
      }),
    );
  });

  it("api path: PUT draft sends config + expectedRevision + If-Match only", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        revision: 3,
        etag: 'W/"new"',
        status: "draft",
        config: draftConfig,
      },
      meta,
    });
    const result = await saveStorefrontDraft({
      storeId: "store_live",
      config: initialStorefrontConfig,
      logoStyle: "letter",
      expectedRevision: 2,
      expectedETag: 'W/"old"',
    });
    expect(result.revision).toBe(3);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/storefront/draft",
      expect.objectContaining({
        method: "PUT",
        ifMatch: 'W/"old"',
        body: expect.objectContaining({
          expectedRevision: 2,
          expectedETag: 'W/"old"',
          config: expect.objectContaining({
            layout: initialStorefrontConfig.layout,
            logoStyle: "letter",
          }),
        }),
      }),
    );
    const body = apiRequestMock.mock.calls[0][1].body as Record<
      string,
      unknown
    >;
    expect(body.logoStyle).toBeUndefined();
    expect(body.storeId).toBeUndefined();
    expect(body.reason).toBeUndefined();
  });

  it("api path: publish sends strict body + idempotency; not optimistic", async () => {
    installApiSeller();
    apiRequestMock.mockResolvedValueOnce({
      data: {
        accepted: true,
        revision: 3,
        etag: 'W/"pub"',
        requestId: "req_pub",
        storeId: "store_live",
      },
      meta,
    });
    const result = await publishStorefrontDraft({
      storeId: "store_live",
      config: initialStorefrontConfig,
      logoStyle: "spark",
      expectedRevision: 3,
      expectedETag: 'W/"abc"',
      reason: "seller_storefront_publish",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.accepted).toBe(true);
    expect(result.requestId).toBe("req_pub");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/stores/store_live/storefront/publish",
      expect.objectContaining({
        method: "POST",
        ifMatch: 'W/"abc"',
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        auditReason: "seller_storefront_publish",
        body: expect.objectContaining({
          expectedRevision: 3,
          expectedETag: 'W/"abc"',
          config: expect.objectContaining({ logoStyle: "spark" }),
        }),
      }),
    );
  });

  it("api path: 409 conflict preserves throw (no success)", async () => {
    installApiSeller();
    const conflict = new ApiError(409, {
      code: PROBLEM_CODES.STOREFRONT_REVISION_CONFLICT,
      message: "Storefront revision conflict",
      details: {
        expectedRevision: 2,
        currentRevision: 5,
        currentETag: 'W/"server"',
      },
    });
    apiRequestMock.mockRejectedValueOnce(conflict);
    await expect(
      saveStorefrontDraft({
        storeId: "store_live",
        config: initialStorefrontConfig,
        logoStyle: "letter",
        expectedRevision: 2,
        expectedETag: 'W/"stale"',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(isStorefrontRevisionConflict(conflict)).toBe(true);
    expect(parseStorefrontConflict(conflict)?.currentRevision).toBe(5);
  });

  it("api path: publish 409 is not accepted success", async () => {
    installApiSeller();
    apiRequestMock.mockRejectedValueOnce(
      new ApiError(409, {
        code: PROBLEM_CODES.STOREFRONT_REVISION_CONFLICT,
        message: "Storefront revision conflict",
        details: { currentRevision: 9, currentETag: 'W/"x"' },
      }),
    );
    await expect(
      publishStorefrontDraft({
        storeId: "store_live",
        config: initialStorefrontConfig,
        logoStyle: "letter",
        expectedRevision: 3,
        expectedETag: 'W/"stale"',
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
