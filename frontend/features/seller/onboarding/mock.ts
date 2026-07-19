/**
 * SEL-110 — mock fixtures for sellerCatalog mock mode (prototype parity).
 */

import type { OnboardingProgress, SlugAvailability } from "./contracts";

const MOCK_TAKEN = new Set(["admin", "fersaku", "asep-ai-tools"]);

let mockProgress: OnboardingProgress = {
  state: "NOT_STARTED",
  step: "NOT_STARTED",
  completed: false,
  completedAt: null,
  merchantId: "",
  storeId: "",
  store: null,
  canComplete: false,
  productOptional: true,
};

export function resetMockOnboardingProgress(): void {
  mockProgress = {
    state: "NOT_STARTED",
    step: "NOT_STARTED",
    completed: false,
    completedAt: null,
    merchantId: "",
    storeId: "",
    store: null,
    canComplete: false,
    productOptional: true,
  };
}

export function getMockOnboardingProgress(): OnboardingProgress {
  return {
    ...mockProgress,
    store: mockProgress.store ? { ...mockProgress.store } : null,
  };
}

export function createMockOnboardingStore(input: {
  name: string;
  bio?: string;
  slug?: string;
  accentColor?: string;
}): OnboardingProgress {
  if (mockProgress.storeId) {
    return getMockOnboardingProgress();
  }
  const name = input.name.trim();
  const bio = (input.bio ?? "").trim();
  const slug = (input.slug ?? "").trim() || "toko-demo";
  mockProgress = {
    state: "VISUAL",
    step: "VISUAL",
    completed: false,
    completedAt: null,
    merchantId: "merch_mock",
    storeId: "store_mock_onboarding",
    store: {
      storeId: "store_mock_onboarding",
      merchantId: "merch_mock",
      slug,
      name,
      bio,
      address: "",
      accentColor: input.accentColor ?? "#d7ff64",
      status: "ACTIVE",
      canonical: true,
    },
    canComplete: name.length > 2 && bio.length > 12 && slug.length > 3,
    productOptional: true,
  };
  return getMockOnboardingProgress();
}

export function patchMockOnboardingStore(input: {
  name?: string;
  bio?: string;
  slug?: string;
  accentColor?: string;
  step?: OnboardingProgress["step"];
}): OnboardingProgress {
  if (!mockProgress.store) {
    return createMockOnboardingStore({
      name: input.name ?? "Toko",
      bio: input.bio,
      slug: input.slug,
      accentColor: input.accentColor,
    });
  }
  const store = { ...mockProgress.store };
  if (input.name !== undefined) store.name = input.name.trim();
  if (input.bio !== undefined) store.bio = input.bio.trim();
  if (input.slug !== undefined) store.slug = input.slug.trim();
  if (input.accentColor !== undefined) store.accentColor = input.accentColor;
  const step = input.step ?? mockProgress.step;
  mockProgress = {
    ...mockProgress,
    store,
    storeId: store.storeId,
    merchantId: store.merchantId,
    state: step === "COMPLETE" ? "PRODUCT_OPTIONAL" : step,
    step: step === "COMPLETE" ? "PRODUCT_OPTIONAL" : step,
    canComplete:
      store.name.length > 2 && store.bio.length > 12 && store.slug.length > 3,
  };
  return getMockOnboardingProgress();
}

export function completeMockOnboarding(): OnboardingProgress {
  if (mockProgress.completed) return getMockOnboardingProgress();
  if (!mockProgress.store) {
    return getMockOnboardingProgress();
  }
  mockProgress = {
    ...mockProgress,
    state: "COMPLETE",
    step: "COMPLETE",
    completed: true,
    completedAt: new Date().toISOString(),
    canComplete: true,
  };
  return getMockOnboardingProgress();
}

export function mockSlugAvailability(raw: string): SlugAvailability {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return {
    slug,
    available: slug.length > 3 && !MOCK_TAKEN.has(slug),
  };
}
