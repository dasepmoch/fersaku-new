/**
 * ADM-230 — admin own profile / prefs / sessions transport adapters.
 * Profile/prefs: /v1/me/* (actor-scoped). Sessions: /v1/auth/sessions.
 * Avatar upload: INT-175 DISABLED — never call personal media endpoints.
 * Notifications inbox: reuse shared BUY-140 adapters (surface=admin) — not here.
 */

import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  buyerProfileEnvelopeSchema,
  buyerPatchProfileRequestSchema,
  buyerSessionListEnvelopeSchema,
  buyerSessionRevokeEnvelopeSchema,
  notificationPreferencesEnvelopeSchema,
  notificationPreferencesPatchRequestSchema,
  type BuyerPatchProfileRequest,
  type NotificationPreferencesPatchRequest,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import { logoutSession } from "@/shared/auth/session-store";
import { createIdempotencyKey } from "@/shared/query/mutation-policy";
import type {
  AdminProfile,
  AdminSession,
  PatchAdminNotificationPreferencesInput,
  PatchAdminProfileInput,
  RevokeAdminSessionInput,
  RevokeAdminSessionResult,
} from "./contracts";
import {
  displayTimezoneToWire,
  mapAdminProfileDto,
  mapAdminSessionListDto,
  mapNotificationPrefsToAdminToggles,
  profileInitials,
} from "./mappers";
import { demoAdminProfile, demoAdminSessions } from "./mock";

type ProfileEnvelope = z.infer<typeof buyerProfileEnvelopeSchema>;
type PrefsEnvelope = z.infer<typeof notificationPreferencesEnvelopeSchema>;
type SessionListEnvelope = z.infer<typeof buyerSessionListEnvelopeSchema>;
type RevokeEnvelope = z.infer<typeof buyerSessionRevokeEnvelopeSchema>;

/** Profile/prefs/sessions gate: auth domain (shared me + auth sessions). */
export function isAdminProfileApiDomain(): boolean {
  return getDomainSource("auth") === "api";
}

function isProfileMockMode(): boolean {
  return shouldUseMockFixtures("auth");
}

/**
 * Session-bound admin profile + notification preferences.
 * GET /v1/me/profile + GET /v1/me/notification-preferences.
 */
export async function getAdminProfile(
  signal?: AbortSignal,
): Promise<AdminProfile> {
  if (isProfileMockMode()) return demoAdminProfile();

  const [profileRes, prefsRes] = await Promise.all([
    apiRequest<ProfileEnvelope>("/v1/me/profile", {
      schema: buyerProfileEnvelopeSchema,
      signal,
    }),
    apiRequest<PrefsEnvelope>("/v1/me/notification-preferences", {
      schema: notificationPreferencesEnvelopeSchema,
      signal,
    }),
  ]);
  return mapAdminProfileDto(profileRes.data, prefsRes.data.preferences);
}

/**
 * PATCH /v1/me/profile with expectedVersion.
 * Email never patched here (dual-confirm AUT-120). No avatarRef (INT-175).
 * jobTitle is not a closed BE field — never sent.
 */
export async function patchAdminProfile(
  input: PatchAdminProfileInput,
  signal?: AbortSignal,
): Promise<AdminProfile> {
  if (input.expectedVersion < 1) {
    throw new Error("expectedVersion required");
  }

  if (isProfileMockMode()) {
    const base = demoAdminProfile();
    const fullName = input.displayName?.trim() || base.fullName;
    return {
      ...base,
      fullName,
      timezone: input.timezone?.trim() || base.timezone,
      revision: base.revision + 1,
      initials: profileInitials(fullName),
    };
  }

  const body: BuyerPatchProfileRequest = buyerPatchProfileRequestSchema.parse({
    expectedVersion: input.expectedVersion,
    displayName: input.displayName,
    timezone: input.timezone
      ? displayTimezoneToWire(input.timezone)
      : undefined,
  });

  const response = await apiRequest<ProfileEnvelope, BuyerPatchProfileRequest>(
    "/v1/me/profile",
    {
      schema: buyerProfileEnvelopeSchema,
      method: "PATCH",
      body,
      signal,
    },
  );

  let prefs: Parameters<typeof mapAdminProfileDto>[1];
  try {
    const prefsRes = await apiRequest<PrefsEnvelope>(
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
  return mapAdminProfileDto(response.data, prefs);
}

/**
 * PATCH /v1/me/notification-preferences for closed event codes only.
 */
export async function patchAdminNotificationPreferences(
  input: PatchAdminNotificationPreferencesInput,
  signal?: AbortSignal,
): Promise<Pick<AdminProfile, "kyc" | "withdrawals" | "incidents" | "digest">> {
  if (isProfileMockMode()) {
    const base = demoAdminProfile();
    return {
      kyc: input.kyc ?? base.kyc,
      withdrawals: input.withdrawals ?? base.withdrawals,
      incidents: input.incidents ?? base.incidents,
      digest: input.digest ?? base.digest,
    };
  }

  const preferences: NotificationPreferencesPatchRequest["preferences"] = [];
  if (input.kyc !== undefined) {
    preferences.push({
      eventCode: "KYC_UPDATE",
      channel: "EMAIL",
      enabled: Boolean(input.kyc),
    });
  }
  if (input.withdrawals !== undefined) {
    preferences.push({
      eventCode: "WITHDRAWAL_UPDATE",
      channel: "EMAIL",
      enabled: Boolean(input.withdrawals),
    });
  }
  if (input.incidents !== undefined) {
    preferences.push({
      eventCode: "SECURITY_ALERT",
      channel: "EMAIL",
      enabled: Boolean(input.incidents),
    });
  }
  if (input.digest !== undefined) {
    preferences.push({
      eventCode: "MARKETING_NEWSLETTER",
      channel: "EMAIL",
      enabled: Boolean(input.digest),
    });
  }
  if (preferences.length === 0) {
    return mapNotificationPrefsToAdminToggles([]);
  }

  const body = notificationPreferencesPatchRequestSchema.parse({
    preferences,
  });

  const response = await apiRequest<
    PrefsEnvelope,
    NotificationPreferencesPatchRequest
  >("/v1/me/notification-preferences", {
    schema: notificationPreferencesEnvelopeSchema,
    method: "PATCH",
    body,
    signal,
  });
  return mapNotificationPrefsToAdminToggles(response.data.preferences);
}

/**
 * List own sessions (auth surface).
 * GET /v1/auth/sessions — same SessionView as seller/buyer alias.
 */
export async function listAdminSessions(
  signal?: AbortSignal,
): Promise<AdminSession[]> {
  if (isProfileMockMode()) return demoAdminSessions();

  const response = await apiRequest<SessionListEnvelope>("/v1/auth/sessions", {
    schema: buyerSessionListEnvelopeSchema,
    signal,
  });
  return mapAdminSessionListDto(response.data.sessions);
}

/**
 * Revoke one own session.
 * POST /v1/auth/sessions/{sessionId}/revoke
 * When current is revoked, BE clears cookie — caller must clear private cache + redirect.
 */
export async function revokeAdminSession(
  input: RevokeAdminSessionInput,
  signal?: AbortSignal,
): Promise<RevokeAdminSessionResult> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    throw new Error("sessionId required");
  }
  const revokedCurrent = Boolean(
    input.currentSessionId && input.currentSessionId === sessionId,
  );

  if (isProfileMockMode()) {
    const isCurrent =
      revokedCurrent ||
      demoAdminSessions().some((s) => s.id === sessionId && s.current);
    return {
      accepted: true,
      sessionId,
      revokedCurrent: isCurrent,
      requestId: `mock_revoke_${sessionId}`,
    };
  }

  const response = await apiRequest<RevokeEnvelope>(
    `/v1/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
    {
      schema: buyerSessionRevokeEnvelopeSchema,
      method: "POST",
      signal,
      idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
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
 * Bulk revoke every other session.
 * POST /v1/auth/sessions/revoke-others
 */
export async function revokeOtherAdminSessions(
  signal?: AbortSignal,
): Promise<{ accepted: boolean; revokedCount: number }> {
  if (isProfileMockMode()) {
    const others = demoAdminSessions().filter((s) => !s.current).length;
    return { accepted: true, revokedCount: others };
  }

  const response = await apiRequest<RevokeEnvelope>(
    "/v1/auth/sessions/revoke-others",
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
 * POST /v1/auth/sessions/revoke-all
 */
export async function revokeAllAdminSessions(signal?: AbortSignal): Promise<{
  accepted: boolean;
  revokedCount: number;
  clearedCookie: boolean;
}> {
  if (isProfileMockMode()) {
    return {
      accepted: true,
      revokedCount: demoAdminSessions().length,
      clearedCookie: true,
    };
  }

  const response = await apiRequest<RevokeEnvelope>(
    "/v1/auth/sessions/revoke-all",
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
 * redirect to admin login.
 */
export async function clearAdminSessionAfterRevoke(): Promise<void> {
  await logoutSession({ surface: "admin", redirect: true });
}
