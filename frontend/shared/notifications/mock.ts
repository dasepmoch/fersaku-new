import type { NotificationItemView, NotificationSurface } from "./contracts";
import { notificationData } from "@/shared/ui/account-controls-data";

/** Prototype fixtures — same copy/hrefs as frozen account-controls-data. */
export function demoNotifications(
  surface: NotificationSurface,
): NotificationItemView[] {
  return notificationData[surface].map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    time: item.time,
    href: item.href,
    icon: item.icon,
    unread: true,
    eventCode: "PAYMENT_RECEIPT",
  }));
}

export function demoUnreadCount(surface: NotificationSurface): number {
  return demoNotifications(surface).filter((n) => n.unread).length;
}
