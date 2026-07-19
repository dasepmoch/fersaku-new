import type { z } from "zod";
import { apiRequest } from "@/shared/api/http-client";
import {
  NOTIFICATION_INBOX_LIST_LIMIT,
  notificationEnvelopeSchema,
  notificationListEnvelopeSchema,
  readAllEnvelopeSchema,
  unreadCountEnvelopeSchema,
  type NotificationDataDto,
} from "@/shared/api/schemas";
import {
  getDomainSource,
  shouldUseMockFixtures,
  type DataDomain,
} from "@/shared/data/domain-source";
import type {
  MarkAllNotificationsReadResult,
  NotificationItemView,
  NotificationSurface,
} from "./contracts";
import {
  filterNotificationsForSurface,
  mapNotificationListDto,
} from "./mappers";
import { demoNotifications, demoUnreadCount } from "./mock";

type ListEnvelope = z.infer<typeof notificationListEnvelopeSchema>;
type UnreadEnvelope = z.infer<typeof unreadCountEnvelopeSchema>;
type ReadAllEnvelope = z.infer<typeof readAllEnvelopeSchema>;
type OneEnvelope = z.infer<typeof notificationEnvelopeSchema>;

const SURFACE_DOMAIN: Record<NotificationSurface, DataDomain> = {
  buyer: "buyer",
  seller: "sellerOperations",
  admin: "adminRead",
};

const SURFACE_PREFIX: Record<NotificationSurface, string> = {
  buyer: "/v1/buyer/notifications",
  seller: "/v1/seller/notifications",
  admin: "/v1/admin/notifications",
};

export function notificationDomainForSurface(
  surface: NotificationSurface,
): DataDomain {
  return SURFACE_DOMAIN[surface];
}

export function isNotificationApiDomain(surface: NotificationSurface): boolean {
  return getDomainSource(SURFACE_DOMAIN[surface]) === "api";
}

function basePath(surface: NotificationSurface): string {
  return SURFACE_PREFIX[surface];
}

/**
 * List inbox for the active shell surface (session recipient-scoped).
 * Bounded first page only — no cursor UI on notification center.
 */
export async function listNotifications(
  surface: NotificationSurface,
  signal?: AbortSignal,
): Promise<NotificationItemView[]> {
  if (shouldUseMockFixtures(SURFACE_DOMAIN[surface])) {
    return demoNotifications(surface);
  }

  const response = await apiRequest<ListEnvelope>(basePath(surface), {
    schema: notificationListEnvelopeSchema,
    query: { limit: NOTIFICATION_INBOX_LIST_LIMIT },
    signal,
  });
  const scoped = filterNotificationsForSurface(response.data, surface);
  return mapNotificationListDto(scoped, surface).items;
}

export async function getUnreadNotificationCount(
  surface: NotificationSurface,
  signal?: AbortSignal,
): Promise<number> {
  if (shouldUseMockFixtures(SURFACE_DOMAIN[surface])) {
    return demoUnreadCount(surface);
  }

  const response = await apiRequest<UnreadEnvelope>(
    `${basePath(surface)}/unread-count`,
    {
      schema: unreadCountEnvelopeSchema,
      signal,
    },
  );
  return Math.max(0, Math.trunc(response.data.count));
}

/** Mark one notification read after server success (cross-recipient → 404). */
export async function markNotificationRead(
  surface: NotificationSurface,
  notificationId: string,
  signal?: AbortSignal,
): Promise<NotificationDataDto> {
  if (shouldUseMockFixtures(SURFACE_DOMAIN[surface])) {
    return {
      id: notificationId,
      eventCode: "PAYMENT_RECEIPT",
      title: "",
      body: "",
      ctaPath: "",
      contentVersion: "1",
      priority: "INFO",
      surface: surface.toUpperCase() as NotificationDataDto["surface"],
      createdAt: new Date().toISOString(),
      unread: false,
      readAt: new Date().toISOString(),
    };
  }

  const id = encodeURIComponent(notificationId);
  const response = await apiRequest<OneEnvelope>(
    `${basePath(surface)}/${id}/read`,
    {
      schema: notificationEnvelopeSchema,
      method: "POST",
      signal,
    },
  );
  return response.data;
}

export async function markAllNotificationsRead(
  surface: NotificationSurface,
  signal?: AbortSignal,
): Promise<MarkAllNotificationsReadResult> {
  if (shouldUseMockFixtures(SURFACE_DOMAIN[surface])) {
    return { updated: demoUnreadCount(surface) };
  }

  const response = await apiRequest<ReadAllEnvelope>(
    `${basePath(surface)}/read-all`,
    {
      schema: readAllEnvelopeSchema,
      method: "POST",
      signal,
    },
  );
  return { updated: Math.max(0, Math.trunc(response.data.updated)) };
}
