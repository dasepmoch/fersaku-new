import type { LucideIcon } from "lucide-react";
import type { Surface } from "@/shared/ui/account-controls-data";

export type NotificationSurface = Surface;

/** Existing notification-center row view model (JSX unchanged). */
export type NotificationItemView = {
  id: string;
  title: string;
  body: string;
  time: string;
  href: string;
  icon: LucideIcon;
  unread: boolean;
  eventCode: string;
};

export type NotificationListView = {
  items: NotificationItemView[];
  unreadCount: number;
};

export type MarkNotificationReadInput = {
  notificationId: string;
};

export type MarkAllNotificationsReadResult = {
  updated: number;
};
