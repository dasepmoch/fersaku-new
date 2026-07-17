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
import type { SessionClaims } from "@/shared/auth/session-model";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDomainForSurface,
} from "./api";
import type { NotificationItemView, NotificationSurface } from "./contracts";
import { demoNotifications, demoUnreadCount } from "./mock";

function subjectKey(
  claims: SessionClaims | null,
  surface: NotificationSurface,
): string {
  if (!claims?.subjectId) return "anon";
  if (claims.surface !== surface) return `other:${claims.subjectId}`;
  return `${claims.subjectId}:${claims.sessionId ?? "session"}`;
}

function notificationsEnabled(
  surface: NotificationSurface,
  claims: SessionClaims | null,
): boolean {
  const domain = notificationDomainForSurface(surface);
  if (getDomainSource(domain) === "mock") return true;
  return Boolean(claims?.subjectId && claims.surface === surface);
}

function invalidateNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  surface: NotificationSurface,
  subject: string,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.notifications.list(surface, subject),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.notifications.unreadCount(surface, subject),
  });
}

/** Shell list — backend authoritative when domain is api. */
export function useNotifications(surface: NotificationSurface) {
  const claims = useSessionClaims();
  const subject = subjectKey(claims, surface);
  const domain = notificationDomainForSurface(surface);
  return useAppQuery({
    queryKey: queryKeys.notifications.list(surface, subject),
    queryFn: (signal) => listNotifications(surface, signal),
    surface: "private",
    keepPrevious: true,
    placeholderData: mockPlaceholderData(domain, demoNotifications(surface)),
    enabled: notificationsEnabled(surface, claims),
  });
}

export function useUnreadNotificationCount(surface: NotificationSurface) {
  const claims = useSessionClaims();
  const subject = subjectKey(claims, surface);
  const domain = notificationDomainForSurface(surface);
  return useAppQuery({
    queryKey: queryKeys.notifications.unreadCount(surface, subject),
    queryFn: (signal) => getUnreadNotificationCount(surface, signal),
    surface: "private",
    placeholderData: mockPlaceholderData(domain, demoUnreadCount(surface)),
    enabled: notificationsEnabled(surface, claims),
  });
}

export function useMarkNotificationReadMutation(surface: NotificationSurface) {
  const claims = useSessionClaims();
  const subject = subjectKey(claims, surface);
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["notifications", surface, subject, "mark-read"],
    mutationFn: (notificationId: string, signal) =>
      markNotificationRead(surface, notificationId, signal),
    onSuccess: (_data, notificationId) => {
      queryClient.setQueryData<NotificationItemView[]>(
        queryKeys.notifications.list(surface, subject),
        (prev) =>
          prev?.map((item) =>
            item.id === notificationId ? { ...item, unread: false } : item,
          ),
      );
      queryClient.setQueryData<number>(
        queryKeys.notifications.unreadCount(surface, subject),
        (prev) => Math.max(0, (prev ?? 1) - 1),
      );
      invalidateNotificationQueries(queryClient, surface, subject);
    },
  });
}

export function useMarkAllNotificationsReadMutation(
  surface: NotificationSurface,
) {
  const claims = useSessionClaims();
  const subject = subjectKey(claims, surface);
  const queryClient = useQueryClient();
  return useAppMutation({
    mutationKey: ["notifications", surface, subject, "read-all"],
    mutationFn: (_void: void, signal) =>
      markAllNotificationsRead(surface, signal),
    onSuccess: () => {
      queryClient.setQueryData<NotificationItemView[]>(
        queryKeys.notifications.list(surface, subject),
        (prev) => prev?.map((item) => ({ ...item, unread: false })),
      );
      queryClient.setQueryData<number>(
        queryKeys.notifications.unreadCount(surface, subject),
        0,
      );
      invalidateNotificationQueries(queryClient, surface, subject);
    },
  });
}
