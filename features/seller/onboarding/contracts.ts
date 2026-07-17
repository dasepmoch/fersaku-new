/**
 * SEL-110 — seller onboarding domain contracts (UI + API mapped shapes).
 */

export type OnboardingServerState =
  | "NOT_STARTED"
  | "IDENTITY"
  | "SLUG"
  | "VISUAL"
  | "PRODUCT_OPTIONAL"
  | "COMPLETE";

/** UI wizard steps (0-based) matching store-onboarding layout. */
export const ONBOARDING_UI_STEPS = [
  "Welcome",
  "Identitas",
  "Alamat toko",
  "Visual",
  "Produk pertama",
  "Selesai",
] as const;

export type OnboardingStoreSummary = {
  storeId: string;
  merchantId: string;
  slug: string;
  name: string;
  bio: string;
  address: string;
  accentColor: string;
  status: string;
  canonical: boolean;
};

export type OnboardingProgress = {
  state: OnboardingServerState;
  step: OnboardingServerState;
  completed: boolean;
  completedAt: string | null;
  merchantId: string;
  storeId: string;
  store: OnboardingStoreSummary | null;
  canComplete: boolean;
  productOptional: boolean;
};

export type CreateOnboardingStoreInput = {
  name: string;
  bio?: string;
  slug?: string;
  address?: string;
  accentColor?: string;
};

export type PatchOnboardingStoreInput = {
  name?: string;
  bio?: string;
  slug?: string;
  address?: string;
  accentColor?: string;
  step?: OnboardingServerState;
};

export type SlugAvailability = {
  slug: string;
  available: boolean;
};

/** Completion panel copy derived from server store (API mode). */
export type CompletionDisplay = {
  /** Replaces mock-only “Storefront mock telah dibuat.” claim. */
  description: string;
  /** Theme + publish line under the store URL. */
  themePublishLine: string;
};
