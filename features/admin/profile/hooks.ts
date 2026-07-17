"use client";

import {
  getDomainSource,
  mockPlaceholderData,
} from "@/shared/data/domain-source";
import { queryKeys } from "@/shared/query/query-keys";
import { useAppQuery } from "@/shared/query/create-query";
import { useAppMutation } from "@/shared/query/create-mutation";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionClaims } from "@/shared/auth/session-provider";
import {
  clearAdminSessionAfterRevoke,
  getAdminProfile,
  listAdminSessions,
  patchAdminNotificationPreferences,
  patchAdminProfile,
  revokeAdminSession,
  revokeAllAdminSessions,
  revokeOtherAdminSessions,
} from "./api";
import type {
  AdminProfile,
  PatchAdminNotificationPreferencesInput,
  PatchAdminProfileInput,
  RevokeAdminSessionInput,
} from "./contracts";
import { demoAdminProfile, demoAdminSessions } from "./mock";

function adminSubjectKey(
  claims: { subjectId?: string; sessionId?: string } | null,
) {
  if (!claims?.subjectId) return "anon";
  return `${claims.subjectId}:${claims.sessionId ?? "session"}`;
}

function profileQueryEnabled(hasSubject: boolean): boolean {
  if (getDomainSource("auth") === "mock") return true;
  return hasSubject;
}

/** ADM-230: authoritative profile + prefs — no localStorage truth on API path. */
export function useAdminProfile() {
  const claims = useSessionClaims();
  const subject = adminSubjectKey(claims);
  return useAppQuery({
    queryKey: queryKeys.admin.profile(subject),
    queryFn: (signal) => getAdminProfile(signal),
    surface: "private",
    placeholderData: mockPlaceholderData("auth", demoAdminProfile()),
    enabled: profileQueryEnabled(Boolean(claims?.subjectId)),
  });
}

/**
 * ADM-230: patch profile with expectedVersion.
 * 409 keeps user input (no optimistic overwrite); invalidate after success.
 */
export function usePatchAdminProfileMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = adminSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["admin", subject, "profile", "patch"],
    mutationFn: (input: PatchAdminProfileInput, signal) =>
      patchAdminProfile(input, signal),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.admin.profile(subject), profile);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.profile(subject),
      });
    },
  });
}

export function usePatchAdminNotificationPreferencesMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = adminSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["admin", subject, "notification-preferences", "patch"],
    mutationFn: (input: PatchAdminNotificationPreferencesInput, signal) =>
      patchAdminNotificationPreferences(input, signal),
    onSuccess: (toggles) => {
      const key = queryKeys.admin.profile(subject);
      const prev = queryClient.getQueryData<AdminProfile>(key);
      if (prev) {
        queryClient.setQueryData(key, { ...prev, ...toggles });
      }
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.notificationPreferences(subject),
      });
    },
  });
}

/** ADM-230: session list (auth) — Trusted sessions panel. */
export function useAdminSessions() {
  const claims = useSessionClaims();
  const subject = adminSubjectKey(claims);
  return useAppQuery({
    queryKey: queryKeys.admin.sessions(subject),
    queryFn: (signal) => listAdminSessions(signal),
    surface: "private",
    placeholderData: mockPlaceholderData("auth", demoAdminSessions()),
    enabled: profileQueryEnabled(Boolean(claims?.subjectId)),
  });
}

/**
 * ADM-230: single revoke — no optimistic removal.
 * Revoking current clears session/private cache and redirects.
 */
export function useRevokeAdminSessionMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = adminSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["admin", subject, "sessions", "revoke"],
    mutationFn: (input: RevokeAdminSessionInput, signal) =>
      revokeAdminSession(
        {
          ...input,
          currentSessionId: claims?.sessionId,
        },
        signal,
      ),
    onSuccess: async (result) => {
      if (result.revokedCurrent) {
        await clearAdminSessionAfterRevoke();
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.sessions(subject),
      });
    },
  });
}

export function useRevokeOtherAdminSessionsMutation() {
  const queryClient = useQueryClient();
  const claims = useSessionClaims();
  const subject = adminSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["admin", subject, "sessions", "revoke-others"],
    mutationFn: (_: void, signal) => revokeOtherAdminSessions(signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.sessions(subject),
      });
    },
  });
}

export function useRevokeAllAdminSessionsMutation() {
  const claims = useSessionClaims();
  const subject = adminSubjectKey(claims);
  return useAppMutation({
    mutationKey: ["admin", subject, "sessions", "revoke-all"],
    mutationFn: (_: void, signal) => revokeAllAdminSessions(signal),
    onSuccess: async () => {
      await clearAdminSessionAfterRevoke();
    },
  });
}
