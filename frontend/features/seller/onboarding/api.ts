/**
 * SEL-110 — onboarding transport (GET/POST/PATCH complete + slug availability).
 */

import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  onboardingProgressEnvelopeSchema,
  slugAvailabilityEnvelopeSchema,
} from "@/shared/api/schemas";
import { shouldUseMockFixtures } from "@/shared/data/domain-source";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  CreateOnboardingStoreInput,
  OnboardingProgress,
  PatchOnboardingStoreInput,
  SlugAvailability,
} from "./contracts";
import { mapOnboardingProgressDto } from "./mappers";
import {
  completeMockOnboarding,
  createMockOnboardingStore,
  getMockOnboardingProgress,
  mockSlugAvailability,
  patchMockOnboardingStore,
} from "./mock";
import { normalizeStoreSlug } from "./slug";

type OnboardingProgressEnvelope = z.infer<typeof onboardingProgressEnvelopeSchema>;
type SlugAvailabilityEnvelope = z.infer<typeof slugAvailabilityEnvelopeSchema>;

function isSellerMock(): boolean {
  return shouldUseMockFixtures("sellerCatalog");
}

export async function getOnboardingProgress(
  signal?: AbortSignal,
): Promise<OnboardingProgress> {
  if (isSellerMock()) return getMockOnboardingProgress();

  const response = await apiRequest<OnboardingProgressEnvelope>("/v1/onboarding", {
    schema: onboardingProgressEnvelopeSchema,
    signal,
  });
  return mapOnboardingProgressDto(response.data);
}

/**
 * Idempotent store create. Pass a stable idempotencyKey for one user intent
 * so duplicate submits do not mint a second key (backend also owner-idempotent).
 */
export async function createOnboardingStore(
  input: CreateOnboardingStoreInput,
  options?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<OnboardingProgress> {
  if (isSellerMock()) {
    return createMockOnboardingStore(input);
  }

  const body = {
    name: input.name,
    ...(input.bio !== undefined ? { bio: input.bio } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.accentColor !== undefined
      ? { accentColor: input.accentColor }
      : {}),
  };

  const response = await apiRequest<OnboardingProgressEnvelope, typeof body>(
    "/v1/onboarding/store",
    {
      method: "POST",
      body,
      schema: onboardingProgressEnvelopeSchema,
      signal: options?.signal,
      idempotencyKey: options?.idempotencyKey ?? createIdempotencyKey(),
    },
  );
  return mapOnboardingProgressDto(response.data);
}

export async function patchOnboardingStore(
  input: PatchOnboardingStoreInput,
  signal?: AbortSignal,
): Promise<OnboardingProgress> {
  if (isSellerMock()) {
    return patchMockOnboardingStore(input);
  }

  const body: Record<string, string> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.bio !== undefined) body.bio = input.bio;
  if (input.slug !== undefined) body.slug = input.slug;
  if (input.address !== undefined) body.address = input.address;
  if (input.accentColor !== undefined) body.accentColor = input.accentColor;
  if (input.step !== undefined) body.step = input.step;

  const response = await apiRequest<OnboardingProgressEnvelope, Record<string, string>>(
    "/v1/onboarding/store",
    {
      method: "PATCH",
      body,
      schema: onboardingProgressEnvelopeSchema,
      signal,
    },
  );
  return mapOnboardingProgressDto(response.data);
}

export async function completeOnboarding(
  options?: {
    skipProduct?: boolean;
    signal?: AbortSignal;
    idempotencyKey?: string;
  },
): Promise<OnboardingProgress> {
  if (isSellerMock()) return completeMockOnboarding();

  const response = await apiRequest<
    OnboardingProgressEnvelope,
    { skipProduct: boolean }
  >("/v1/onboarding/complete", {
    method: "POST",
    body: { skipProduct: options?.skipProduct ?? true },
    schema: onboardingProgressEnvelopeSchema,
    signal: options?.signal,
    idempotencyKey: options?.idempotencyKey ?? createIdempotencyKey(),
  });
  return mapOnboardingProgressDto(response.data);
}

/**
 * Advisory slug check. Caller must debounce + cancel via AbortSignal;
 * only apply result when response.slug matches the latest normalized input.
 */
export async function checkSlugAvailability(
  rawSlug: string,
  signal?: AbortSignal,
): Promise<SlugAvailability> {
  const slug = normalizeStoreSlug(rawSlug);
  if (isSellerMock()) return mockSlugAvailability(slug);

  try {
    const response = await apiRequest<SlugAvailabilityEnvelope>(
      "/v1/stores/slug-availability",
      {
        schema: slugAvailabilityEnvelopeSchema,
        query: { slug },
        signal,
      },
    );
    return {
      slug: response.data.slug,
      available: response.data.available,
    };
  } catch (error) {
    if (error instanceof ApiError && error.name === "AbortError") throw error;
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw error;
    }
    throw error;
  }
}

export {
  getMockOnboardingProgress,
  resetMockOnboardingProgress,
} from "./mock";
