import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onboardingProgressDataSchema,
  slugAvailabilityDataSchema,
} from "@/shared/api/schemas";
import {
  clearDomainSourceSnapshot,
  installDomainSourceSnapshot,
  evaluateDomainSources,
} from "@/shared/data/domain-source";
import {
  checkSlugAvailability,
  completeOnboarding,
  createOnboardingStore,
  getOnboardingProgress,
  patchOnboardingStore,
  resetMockOnboardingProgress,
} from "@/features/seller/onboarding/api";
import {
  formFieldsFromProgress,
  mapCompletionDisplay,
  mapOnboardingProgressDto,
  serverStateFromUiStep,
  uiStepFromServerState,
} from "@/features/seller/onboarding/mappers";
import {
  normalizeAndValidateStoreSlug,
  normalizeStoreSlug,
} from "@/features/seller/onboarding/slug";
import type { OnboardingProgress } from "@/features/seller/onboarding/contracts";
import { createIdempotencyIntentHolder } from "@/shared/query/mutation-policy";

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

function progressDto(
  overrides: Partial<{
    state: string;
    step: string;
    completed: boolean;
    storeId: string;
    merchantId: string;
    name: string;
    slug: string;
    bio: string;
    accentColor: string;
    status: string;
    canComplete: boolean;
  }> = {},
) {
  const state = (overrides.state ?? "IDENTITY") as
    | "NOT_STARTED"
    | "IDENTITY"
    | "SLUG"
    | "VISUAL"
    | "PRODUCT_OPTIONAL"
    | "COMPLETE";
  const step = (overrides.step ?? state) as typeof state;
  const storeId = overrides.storeId ?? "store_1";
  const merchantId = overrides.merchantId ?? "merch_1";
  return {
    state,
    step,
    completed: overrides.completed ?? false,
    completedAt: overrides.completed ? "2026-07-17T00:00:00Z" : null,
    merchantId,
    storeId,
    canComplete: overrides.canComplete ?? true,
    productOptional: true,
    store: {
      storeId,
      merchantId,
      slug: overrides.slug ?? "toko-saya",
      name: overrides.name ?? "Toko Saya",
      bio: overrides.bio ?? "Deskripsi toko yang cukup panjang.",
      address: "",
      accentColor: overrides.accentColor ?? "#d7ff64",
      status: overrides.status ?? "ACTIVE",
      canonical: true,
    },
  };
}

describe("SEL-110 slug normalization", () => {
  it("matches backend-style normalize (lowercase, hyphens, strip junk)", () => {
    expect(normalizeStoreSlug("My Cool Shop")).toBe("my-cool-shop");
    expect(normalizeStoreSlug("  A--B__C  ")).toBe("a-b-c");
    expect(normalizeStoreSlug("Admin")).toBe("admin");
  });

  it("rejects reserved and short slugs", () => {
    expect(normalizeAndValidateStoreSlug("admin").valid).toBe(false);
    expect(normalizeAndValidateStoreSlug("ab").valid).toBe(false);
    expect(normalizeAndValidateStoreSlug("toko-saya").valid).toBe(true);
  });
});

describe("SEL-110 progress schema + resume mapping", () => {
  it("parses onboarding progress envelope data", () => {
    const dto = progressDto({ state: "SLUG", step: "SLUG" });
    const parsed = onboardingProgressDataSchema.parse(dto);
    expect(parsed.step).toBe("SLUG");
    expect(parsed.store?.slug).toBe("toko-saya");
  });

  it("resume: server step maps to UI index without reset to welcome", () => {
    expect(uiStepFromServerState("NOT_STARTED")).toBe(0);
    expect(uiStepFromServerState("IDENTITY")).toBe(1);
    expect(uiStepFromServerState("SLUG")).toBe(2);
    expect(uiStepFromServerState("VISUAL")).toBe(3);
    expect(uiStepFromServerState("PRODUCT_OPTIONAL")).toBe(4);
    expect(uiStepFromServerState("COMPLETE", true)).toBe(5);
    expect(serverStateFromUiStep(2)).toBe("SLUG");
  });

  it("formFieldsFromProgress restores draft fields", () => {
    const p = mapOnboardingProgressDto(
      progressDto({
        name: "Atelier Co",
        slug: "atelier-co",
        bio: "Produk digital untuk kreator modern.",
        accentColor: "#ff7958",
      }),
    );
    expect(formFieldsFromProgress(p)).toEqual({
      name: "Atelier Co",
      bio: "Produk digital untuk kreator modern.",
      slug: "atelier-co",
      accent: "#ff7958",
    });
  });
});

describe("SEL-110 completion display (no mock claim in API mode)", () => {
  it("mock mode keeps prototype copy", () => {
    const d = mapCompletionDisplay(null, "mock");
    expect(d.description).toContain("Storefront mock telah dibuat");
    expect(d.themePublishLine).toBe("Atelier theme • Published");
  });

  it("API mode removes mock claim and binds publish state", () => {
    const completed: OnboardingProgress = mapOnboardingProgressDto(
      progressDto({ completed: true, state: "COMPLETE", status: "ACTIVE" }),
    );
    const d = mapCompletionDisplay(completed, "api");
    expect(d.description).not.toContain("mock");
    expect(d.description).toContain("Storefront kamu sudah siap");
    expect(d.themePublishLine).toBe("Atelier theme • Published");

    const draft: OnboardingProgress = mapOnboardingProgressDto(
      progressDto({ completed: false, status: "DRAFT" }),
    );
    expect(mapCompletionDisplay(draft, "api").themePublishLine).toBe(
      "Atelier theme • DRAFT",
    );
  });
});

describe("SEL-110 slug race / stale response", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
    installApiSeller();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("parses availability schema", () => {
    expect(
      slugAvailabilityDataSchema.parse({ slug: "toko-a", available: true }),
    ).toEqual({ slug: "toko-a", available: true });
  });

  it("stale slower response must not win: consumer matches latest slug", async () => {
    let resolveSlow: (v: unknown) => void = () => {};
    const slow = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    apiRequestMock.mockImplementation(async (path: string, opts?: { query?: { slug?: string } }) => {
      const slug = opts?.query?.slug ?? "";
      if (slug === "slow-shop") {
        await slow;
        return {
          data: { slug: "slow-shop", available: true },
          meta: { requestId: "r1", timestamp: "2026-07-17T00:00:00Z" },
        };
      }
      return {
        data: { slug: "fast-shop", available: false },
        meta: { requestId: "r2", timestamp: "2026-07-17T00:00:00Z" },
      };
    });

    const latest = { slug: "slow-shop" };
    const apply = (result: { slug: string; available: boolean }) => {
      if (result.slug !== latest.slug) return null;
      return result.available;
    };

    const pSlow = checkSlugAvailability("slow-shop");
    latest.slug = "fast-shop";
    const fast = await checkSlugAvailability("fast-shop");
    expect(apply(fast)).toBe(false);

    resolveSlow(undefined);
    const slowResult = await pSlow;
    expect(apply(slowResult)).toBeNull();
    expect(slowResult.available).toBe(true);
  });
});

describe("SEL-110 duplicate create is idempotent", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
    installApiSeller();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("reuses one Idempotency-Key for the same create intent", async () => {
    const holder = createIdempotencyIntentHolder();
    const body = { name: "Toko Satu", bio: "Deskripsi toko yang panjang." };
    holder.bindBody(body);
    const key = holder.getKey();

    apiRequestMock.mockResolvedValue({
      data: progressDto({ storeId: "store_same", name: "Toko Satu" }),
      meta: { requestId: "r", timestamp: "2026-07-17T00:00:00Z" },
    });

    const a = await createOnboardingStore(body, { idempotencyKey: key });
    const b = await createOnboardingStore(body, { idempotencyKey: key });

    expect(a.storeId).toBe("store_same");
    expect(b.storeId).toBe("store_same");
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    const keys = apiRequestMock.mock.calls.map(
      (c) => (c[1] as { idempotencyKey?: string })?.idempotencyKey,
    );
    expect(keys[0]).toBe(key);
    expect(keys[1]).toBe(key);
    expect(keys[0]).toMatch(
      /^[0-9a-f-]{36}$|^idem_[a-z0-9]+_[a-z0-9]+$/i,
    );
  });

  it("mock create returns same store on second submit", async () => {
    installMockSeller();
    resetMockOnboardingProgress();
    const first = await createOnboardingStore({
      name: "Toko Mock",
      bio: "Deskripsi toko yang panjang.",
      slug: "toko-mock",
    });
    const second = await createOnboardingStore({
      name: "Toko Mock Lain",
      bio: "Deskripsi toko yang panjang.",
      slug: "toko-lain",
    });
    expect(second.storeId).toBe(first.storeId);
    expect(second.store?.name).toBe("Toko Mock");
  });
});

describe("SEL-110 completion server-authoritative", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    clearDomainSourceSnapshot();
    installApiSeller();
  });

  afterEach(() => {
    clearDomainSourceSnapshot();
  });

  it("complete posts skipProduct and maps completed progress", async () => {
    apiRequestMock.mockResolvedValue({
      data: progressDto({
        state: "COMPLETE",
        step: "COMPLETE",
        completed: true,
        canComplete: true,
      }),
      meta: { requestId: "r", timestamp: "2026-07-17T00:00:00Z" },
    });

    const holder = createIdempotencyIntentHolder({ skipProduct: true });
    const p = await completeOnboarding({
      skipProduct: true,
      idempotencyKey: holder.getKey(),
    });

    expect(p.completed).toBe(true);
    expect(p.state).toBe("COMPLETE");
    expect(uiStepFromServerState(p.step, p.completed)).toBe(5);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/onboarding/complete",
      expect.objectContaining({
        method: "POST",
        body: { skipProduct: true },
        idempotencyKey: holder.getKey(),
      }),
    );
  });

  it("GET resume after complete stays on finished step", async () => {
    apiRequestMock.mockResolvedValue({
      data: progressDto({
        state: "COMPLETE",
        step: "COMPLETE",
        completed: true,
      }),
      meta: { requestId: "r", timestamp: "2026-07-17T00:00:00Z" },
    });
    const p = await getOnboardingProgress();
    expect(p.completed).toBe(true);
    expect(uiStepFromServerState(p.step, p.completed)).toBe(5);
  });

  it("PATCH advances draft fields without inventing COMPLETE", async () => {
    apiRequestMock.mockResolvedValue({
      data: progressDto({ state: "PRODUCT_OPTIONAL", step: "PRODUCT_OPTIONAL" }),
      meta: { requestId: "r", timestamp: "2026-07-17T00:00:00Z" },
    });
    const p = await patchOnboardingStore({
      accentColor: "#71d7ff",
      step: "PRODUCT_OPTIONAL",
    });
    expect(p.state).toBe("PRODUCT_OPTIONAL");
    expect(p.completed).toBe(false);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/v1/onboarding/store",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
