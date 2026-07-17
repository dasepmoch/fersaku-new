/**
 * SEL-110 — map onboarding wire DTOs ↔ domain + UI step index.
 */

import type { OnboardingProgressDto } from "@/shared/api/schemas";
import type {
  CompletionDisplay,
  OnboardingProgress,
  OnboardingServerState,
  OnboardingStoreSummary,
} from "./contracts";

const UI_STEP_BY_STATE: Record<OnboardingServerState, number> = {
  NOT_STARTED: 0,
  IDENTITY: 1,
  SLUG: 2,
  VISUAL: 3,
  PRODUCT_OPTIONAL: 4,
  COMPLETE: 5,
};

const STATE_BY_UI_STEP: OnboardingServerState[] = [
  "NOT_STARTED",
  "IDENTITY",
  "SLUG",
  "VISUAL",
  "PRODUCT_OPTIONAL",
  "COMPLETE",
];

export function mapOnboardingProgressDto(
  dto: OnboardingProgressDto,
): OnboardingProgress {
  const store = dto.store
    ? ({
        storeId: dto.store.storeId ?? dto.storeId ?? "",
        merchantId: dto.store.merchantId ?? dto.merchantId ?? "",
        slug: dto.store.slug ?? "",
        name: dto.store.name ?? "",
        bio: dto.store.bio ?? "",
        address: dto.store.address ?? "",
        accentColor: dto.store.accentColor ?? "",
        status: dto.store.status ?? "",
        canonical: dto.store.canonical ?? true,
      } satisfies OnboardingStoreSummary)
    : null;

  return {
    state: dto.state,
    step: dto.step,
    completed: dto.completed,
    completedAt: dto.completedAt ?? null,
    merchantId: dto.merchantId ?? store?.merchantId ?? "",
    storeId: dto.storeId ?? store?.storeId ?? "",
    store,
    canComplete: dto.canComplete ?? false,
    productOptional: dto.productOptional,
  };
}

/** Resume wizard index from server step (never invent COMPLETE without server). */
export function uiStepFromServerState(
  state: OnboardingServerState,
  completed?: boolean,
): number {
  if (completed || state === "COMPLETE") return 5;
  return UI_STEP_BY_STATE[state] ?? 0;
}

/** Explicit step token for PATCH when advancing the wizard. */
export function serverStateFromUiStep(step: number): OnboardingServerState {
  if (step < 0) return "NOT_STARTED";
  if (step >= STATE_BY_UI_STEP.length) return "COMPLETE";
  return STATE_BY_UI_STEP[step] ?? "NOT_STARTED";
}

/**
 * API-mode completion panel: same text nodes/classes, truthful theme/publish.
 * Removes only the documented fake “Storefront mock telah dibuat” claim.
 */
export function mapCompletionDisplay(
  progress: OnboardingProgress | null,
  mode: "api" | "mock",
): CompletionDisplay {
  if (mode === "mock") {
    return {
      description:
        "Storefront mock telah dibuat. Selanjutnya lengkapi produk, rekening payout, MFA, dan test webhook.",
      themePublishLine: "Atelier theme • Published",
    };
  }

  const status = (progress?.store?.status ?? "").toUpperCase();
  const published =
    progress?.completed === true &&
    (status === "ACTIVE" || status === "PUBLISHED" || status === "");
  const publishLabel = published ? "Published" : status || "Draft";

  return {
    description:
      "Storefront kamu sudah siap. Selanjutnya lengkapi produk, rekening payout, MFA, dan test webhook.",
    themePublishLine: `Atelier theme • ${publishLabel}`,
  };
}

/** Apply server store fields into local form state (resume). */
export function formFieldsFromProgress(progress: OnboardingProgress): {
  name: string;
  bio: string;
  slug: string;
  accent: string;
} {
  const store = progress.store;
  return {
    name: store?.name ?? "",
    bio: store?.bio ?? "",
    slug: store?.slug ?? "",
    accent: store?.accentColor || "#d7ff64",
  };
}
