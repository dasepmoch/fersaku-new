import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  BUYER_PURCHASE_LIST_LIMIT,
  buyerCreateReviewRequestSchema,
  buyerPatchProfileRequestSchema,
  buyerPatchReviewRequestSchema,
  buyerProfileEnvelopeSchema,
  buyerPurchaseDetailEnvelopeSchema,
  buyerPurchaseListEnvelopeSchema,
  buyerReviewEnvelopeSchema,
  buyerSessionListEnvelopeSchema,
  buyerSessionRevokeEnvelopeSchema,
  notificationPreferencesEnvelopeSchema,
  notificationPreferencesPatchRequestSchema,
  type BuyerCreateReviewRequest,
  type BuyerPatchProfileRequest,
  type BuyerPatchReviewRequest,
  type NotificationPreferencesPatchRequest,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { logoutSession } from "@/shared/auth/session-store";
import type {
  BuyerProfile,
  BuyerPurchase,
  BuyerPurchaseListFilters,
  BuyerReview,
  BuyerSession,
  CreateBuyerReviewInput,
  PatchBuyerNotificationPreferencesInput,
  PatchBuyerProfileInput,
  PatchBuyerReviewInput,
} from "./contracts";
import {
  mapBuyerProfileDto,
  mapBuyerPurchaseDetailDto,
  mapBuyerPurchaseSummaryListDto,
  mapBuyerReviewDto,
  mapBuyerSessionListDto,
  mapNotificationPrefsToBuyerToggles,
  profileInitials,
} from "./mappers";
import { demoProfile, demoPurchases, demoSessions } from "./mock";

type PurchaseListEnvelope = z.infer<typeof buyerPurchaseListEnvelopeSchema>;
type PurchaseDetailEnvelope = z.infer<typeof buyerPurchaseDetailEnvelopeSchema>;
type BuyerReviewEnvelope = z.infer<typeof buyerReviewEnvelopeSchema>;
type BuyerSessionListEnvelope = z.infer<typeof buyerSessionListEnvelopeSchema>;
type BuyerSessionRevokeEnvelope = z.infer<
  typeof buyerSessionRevokeEnvelopeSchema
>;
type BuyerProfileEnvelope = z.infer<typeof buyerProfileEnvelopeSchema>;
type NotificationPreferencesEnvelope = z.infer<
  typeof notificationPreferencesEnvelopeSchema
>;

export type RevokeBuyerSessionInput = {
  sessionId: string;
  reason?: string;
  idempotencyKey?: string;
  /** Claims session id — used to detect revoke-current (server clears cookie). */
  currentSessionId?: string;
};

export type RevokeBuyerSessionResult = {
  accepted: boolean;
  sessionId: string;
  /** True when the revoked session was the caller's current cookie session. */
  revokedCurrent: boolean;
  requestId?: string;
};

export type RevokeBuyerOtherSessionsResult = {
  accepted: boolean;
  revokedCount: number;
};

export type RevokeAllBuyerSessionsResult = {
  accepted: boolean;
  revokedCount: number;
  /** Always true on success — cookie cleared server-side. */
  clearedCookie: boolean;
};

/** Launch BoundedNoPaging: first page only; no cursor UI (UI-080 for expansion). */
export const BUYER_PURCHASE_BOUNDED_LIMIT = BUYER_PURCHASE_LIST_LIMIT;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

function matchesClientFilter(
  p: BuyerPurchase,
  filters?: BuyerPurchaseListFilters,
): boolean {
  if (!filters) return true;
  const filter = filters.filter ?? "Semua";
  const q = (filters.q ?? "").trim().toLowerCase();
  const typeOk =
    filter === "Semua" ||
    (filter === "Update tersedia" && Boolean(p.updateAvailable)) ||
    (filter === "File" && p.deliveryType === "download") ||
    (filter === "Akses & kode" && p.deliveryType !== "download");
  if (!typeOk) return false;
  if (!q) return true;
  return (
    p.product.toLowerCase().includes(q) ||
    p.seller.toLowerCase().includes(q) ||
    p.orderId.toLowerCase().includes(q)
  );
}

/**
 * Revoke one own session.
 * POST /v1/buyer/sessions/{sessionId}/revoke
 * Pass currentSessionId from claims so revokedCurrent is authoritative (not device guess).
 * When current is revoked, BE clears cookie — caller must clear private cache + redirect.
 */
export async function revokeBuyerSession(
  input: RevokeBuyerSessionInput,
  signal?: AbortSignal,
): Promise<RevokeBuyerSessionResult> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    throw new Error("sessionId required");
  }
  const revokedCurrent = Boolean(
    input.currentSessionId && input.currentSessionId === sessionId,
  );

  if (shouldUseMockFixtures("buyer")) {
    const isCurrent =
      revokedCurrent ||
      demoSessions().some((s) => s.id === sessionId && s.current);
    return {
      accepted: true,
      sessionId,
      revokedCurrent: isCurrent,
      requestId: `mock_revoke_${sessionId}`,
    };
  }

  const response = await apiRequest<BuyerSessionRevokeEnvelope>(
    `/v1/buyer/sessions/${encodeURIComponent(sessionId)}/revoke`,
    {
      schema: buyerSessionRevokeEnvelopeSchema,
      method: "POST",
      signal,
      idempotencyKey: input.idempotencyKey,
      auditReason: input.reason,
    },
  );
  return {
    accepted: response.data.revoked !== false,
    sessionId,
    revokedCurrent,
    requestId: response.meta.requestId,
  };
}

/**
 * Bulk revoke every other session in one call (no per-session loop).
 * POST /v1/buyer/sessions/revoke-others
 */
export async function revokeOtherBuyerSessions(
  signal?: AbortSignal,
): Promise<RevokeBuyerOtherSessionsResult> {
  if (shouldUseMockFixtures("buyer")) {
    const others = demoSessions().filter((s) => !s.current).length;
    return { accepted: true, revokedCount: others };
  }

  const response = await apiRequest<BuyerSessionRevokeEnvelope>(
    "/v1/buyer/sessions/revoke-others",
    {
      schema: buyerSessionRevokeEnvelopeSchema,
      method: "POST",
      signal,
    },
  );
  return {
    accepted: true,
    revokedCount: Math.max(0, Math.trunc(response.data.revokedCount ?? 0)),
  };
}

/**
 * Revoke all sessions including current; BE clears cookie.
 * POST /v1/buyer/sessions/revoke-all
 * Caller must clear private cache and redirect (INT-120 logout local path).
 */
export async function revokeAllBuyerSessions(
  signal?: AbortSignal,
): Promise<RevokeAllBuyerSessionsResult> {
  if (shouldUseMockFixtures("buyer")) {
    return {
      accepted: true,
      revokedCount: demoSessions().length,
      clearedCookie: true,
    };
  }

  const response = await apiRequest<BuyerSessionRevokeEnvelope>(
    "/v1/buyer/sessions/revoke-all",
    {
      schema: buyerSessionRevokeEnvelopeSchema,
      method: "POST",
      signal,
    },
  );
  return {
    accepted: true,
    revokedCount: Math.max(0, Math.trunc(response.data.revokedCount ?? 0)),
    clearedCookie: true,
  };
}

/**
 * After revoke-current or revoke-all: clear local session/private cache and
 * redirect to buyer login. Prefer dedicated revoke-all endpoint (cookie already
 * cleared); skip second logout POST to avoid 401 noise — use local clear path.
 */
export async function clearBuyerSessionAfterRevoke(): Promise<void> {
  await logoutSession({ surface: "buyer", redirect: true });
}

/**
 * Browser list adapter. Session-scoped by cookie; bounded first page only.
 * Client filter/search mirrors existing PurchaseLibrary controls (no BE search).
 */
export async function listBuyerPurchases(
  signal?: AbortSignal,
  filters?: BuyerPurchaseListFilters,
): Promise<BuyerPurchase[]> {
  if (shouldUseMockFixtures("buyer")) {
    return demoPurchases().filter((p) => matchesClientFilter(p, filters));
  }

  const response = await apiRequest<PurchaseListEnvelope>(
    "/v1/buyer/purchases",
    {
      schema: buyerPurchaseListEnvelopeSchema,
      query: { limit: BUYER_PURCHASE_BOUNDED_LIMIT },
      signal,
    },
  );
  const mapped = mapBuyerPurchaseSummaryListDto(response.data);
  return mapped.filter((p) => matchesClientFilter(p, filters));
}

/**
 * Browser detail adapter. Cross-buyer / missing → null (safe 404).
 * 401 rethrows for auth flow; other errors rethrow (no mock fallback).
 */
export async function getBuyerPurchase(
  orderId: string,
  signal?: AbortSignal,
): Promise<BuyerPurchase | null> {
  if (shouldUseMockFixtures("buyer")) {
    return demoPurchases().find((p) => p.orderId === orderId) || null;
  }

  try {
    // Canonical detail path includes trailing slash (router mounts GET /).
    const response = await apiRequest<PurchaseDetailEnvelope>(
      `/v1/buyer/purchases/${encodeURIComponent(orderId)}/`,
      {
        schema: buyerPurchaseDetailEnvelopeSchema,
        signal,
      },
    );
    return mapBuyerPurchaseDetailDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Session-bound buyer profile + notification preferences (BUY-120).
 * GET /v1/buyer/profile + GET /v1/me/notification-preferences.
 * Avatar/personal media: INT-175 DISABLED — no upload path.
 */
export async function getBuyerProfile(
  signal?: AbortSignal,
): Promise<BuyerProfile> {
  if (shouldUseMockFixtures("buyer")) return demoProfile();

  const [profileRes, prefsRes] = await Promise.all([
    apiRequest<BuyerProfileEnvelope>("/v1/buyer/profile", {
      schema: buyerProfileEnvelopeSchema,
      signal,
    }),
    apiRequest<NotificationPreferencesEnvelope>(
      "/v1/me/notification-preferences",
      {
        schema: notificationPreferencesEnvelopeSchema,
        signal,
      },
    ),
  ]);
  return mapBuyerProfileDto(profileRes.data, prefsRes.data.preferences);
}

/**
 * PATCH /v1/buyer/profile with expectedVersion.
 * Email never patched here (dual-confirm AUT-120).
 * 409 rethrows — caller keeps draft and may refetch.
 */
export async function patchBuyerProfile(
  input: PatchBuyerProfileInput,
  signal?: AbortSignal,
): Promise<BuyerProfile> {
  if (input.expectedVersion < 1) {
    throw new Error("expectedVersion required");
  }

  if (shouldUseMockFixtures("buyer")) {
    const base = demoProfile();
    const name = input.displayName?.trim() || base.name;
    return {
      ...base,
      name,
      phone: input.phone !== undefined ? input.phone.trim() : base.phone,
      locale: input.locale?.trim() || base.locale,
      localeLabel:
        input.locale?.trim() === "en-US" ? "English" : base.localeLabel,
      timezone: input.timezone?.trim() || base.timezone,
      revision: base.revision + 1,
      initials: profileInitials(name),
    };
  }

  const body: BuyerPatchProfileRequest = buyerPatchProfileRequestSchema.parse({
    expectedVersion: input.expectedVersion,
    displayName: input.displayName,
    phone: input.phone,
    locale: input.locale,
    timezone: input.timezone,
  });

  const response = await apiRequest<
    BuyerProfileEnvelope,
    BuyerPatchProfileRequest
  >("/v1/buyer/profile", {
    schema: buyerProfileEnvelopeSchema,
    method: "PATCH",
    body,
    signal,
  });
  // Prefs unchanged on profile-only patch — re-fetch prefs for full view.
  let prefs: Parameters<typeof mapBuyerProfileDto>[1];
  try {
    const prefsRes = await apiRequest<NotificationPreferencesEnvelope>(
      "/v1/me/notification-preferences",
      {
        schema: notificationPreferencesEnvelopeSchema,
        signal,
      },
    );
    prefs = prefsRes.data.preferences;
  } catch {
    prefs = undefined;
  }
  return mapBuyerProfileDto(response.data, prefs);
}

/**
 * PATCH /v1/me/notification-preferences for marketing EMAIL only.
 * PAYMENT_RECEIPT is mandatory and never disabled.
 * Product-update toggle has no closed BE event — not persisted here.
 */
export async function patchBuyerNotificationPreferences(
  input: PatchBuyerNotificationPreferencesInput,
  signal?: AbortSignal,
): Promise<
  Pick<BuyerProfile, "receiptEmail" | "marketingEmail" | "productUpdatesEmail">
> {
  if (shouldUseMockFixtures("buyer")) {
    return {
      receiptEmail: true,
      marketingEmail: Boolean(input.marketingEmail),
      productUpdatesEmail: true,
    };
  }

  const body: NotificationPreferencesPatchRequest =
    notificationPreferencesPatchRequestSchema.parse({
      preferences: [
        {
          eventCode: "MARKETING_NEWSLETTER",
          channel: "EMAIL",
          enabled: Boolean(input.marketingEmail),
        },
      ],
    });

  const response = await apiRequest<
    NotificationPreferencesEnvelope,
    NotificationPreferencesPatchRequest
  >("/v1/me/notification-preferences", {
    schema: notificationPreferencesEnvelopeSchema,
    method: "PATCH",
    body,
    signal,
  });
  return mapNotificationPrefsToBuyerToggles(response.data.preferences);
}

/** Domain gate: buyer profile when buyer domain is api. */
export function isBuyerProfileApiDomain(): boolean {
  return getDomainSource("buyer") === "api";
}

/**
 * List own sessions only (cookie session-bound).
 * GET /v1/buyer/sessions → `{ sessions: SessionView[] }` mapped to BuyerSession.
 * current is BE session-id equality — never client device guess.
 */
export async function listBuyerSessions(
  signal?: AbortSignal,
): Promise<BuyerSession[]> {
  if (shouldUseMockFixtures("buyer")) return demoSessions();

  const response = await apiRequest<BuyerSessionListEnvelope>(
    "/v1/buyer/sessions",
    {
      schema: buyerSessionListEnvelopeSchema,
      signal,
    },
  );
  return mapBuyerSessionListDto(response.data.sessions);
}

/** Domain gate: buyer session security surface when buyer domain is api. */
export function isBuyerSessionApiDomain(): boolean {
  return getDomainSource("buyer") === "api";
}

/** Domain gate: buyer review mutations only when buyer domain is api. */
export function isBuyerReviewApiDomain(): boolean {
  return getDomainSource("buyer") === "api";
}

function mockBuyerReview(
  input:
    CreateBuyerReviewInput | (PatchBuyerReviewInput & { orderItemId?: string }),
  existing?: BuyerReview,
): BuyerReview {
  if ("reviewId" in input) {
    return {
      id: input.reviewId,
      orderItemId: existing?.orderItemId,
      productId: existing?.productId ?? "",
      rating: input.rating ?? existing?.rating ?? 5,
      title: input.title ?? existing?.title ?? "",
      body: input.body ?? existing?.body ?? "",
      status: existing?.status ?? "PUBLISHED",
      verifiedPurchase: existing?.verifiedPurchase ?? true,
      contentVersion: (existing?.contentVersion ?? input.expectedVersion) + 1,
    };
  }
  return {
    id: `rev_mock_${input.orderItemId}`,
    orderItemId: input.orderItemId,
    productId: input.productId ?? "",
    rating: input.rating,
    title: input.title ?? "",
    body: input.body ?? "",
    status: "PUBLISHED",
    verifiedPurchase: true,
    contentVersion: 1,
  };
}

/**
 * Create verified purchase review.
 * POST /v1/buyer/reviews — eligibility/ownership server-authoritative.
 * Does not invent status; maps server ReviewView only.
 */
export async function createBuyerReview(
  input: CreateBuyerReviewInput,
  signal?: AbortSignal,
): Promise<BuyerReview> {
  const orderItemId = input.orderItemId.trim();
  if (!orderItemId) {
    throw new Error("orderItemId required");
  }
  const rating = Math.trunc(input.rating);
  if (rating < 1 || rating > 5) {
    throw new Error("rating must be 1..5");
  }

  if (shouldUseMockFixtures("buyer")) {
    return mockBuyerReview({ ...input, orderItemId, rating });
  }

  const body: BuyerCreateReviewRequest = buyerCreateReviewRequestSchema.parse({
    orderItemId,
    rating,
    title: input.title,
    body: input.body,
    productId: input.productId,
    storeId: input.storeId,
  });

  const response = await apiRequest<
    BuyerReviewEnvelope,
    BuyerCreateReviewRequest
  >("/v1/buyer/reviews", {
    schema: buyerReviewEnvelopeSchema,
    method: "POST",
    body,
    signal,
  });
  return mapBuyerReviewDto(response.data);
}

/**
 * Patch own review content (versioned).
 * PATCH /v1/buyer/reviews/{reviewId}
 * 409 version conflict rethrows — caller keeps typed text and refetches.
 * Non-owner → resource_not_found (safe).
 */
export async function patchBuyerReview(
  input: PatchBuyerReviewInput,
  signal?: AbortSignal,
): Promise<BuyerReview> {
  const reviewId = input.reviewId.trim();
  if (!reviewId) {
    throw new Error("reviewId required");
  }
  if (input.expectedVersion < 1) {
    throw new Error("expectedVersion required");
  }

  if (shouldUseMockFixtures("buyer")) {
    return mockBuyerReview(input);
  }

  const body: BuyerPatchReviewRequest = buyerPatchReviewRequestSchema.parse({
    expectedVersion: input.expectedVersion,
    rating: input.rating,
    title: input.title,
    body: input.body,
  });

  const response = await apiRequest<
    BuyerReviewEnvelope,
    BuyerPatchReviewRequest
  >(`/v1/buyer/reviews/${encodeURIComponent(reviewId)}`, {
    schema: buyerReviewEnvelopeSchema,
    method: "PATCH",
    body,
    signal,
  });
  return mapBuyerReviewDto(response.data);
}
