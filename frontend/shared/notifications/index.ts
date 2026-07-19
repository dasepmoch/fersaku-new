export type {
  MarkAllNotificationsReadResult,
  MarkNotificationReadInput,
  NotificationItemView,
  NotificationListView,
  NotificationSurface,
} from "./contracts";

export {
  filterNotificationsForSurface,
  formatNotificationTime,
  iconForNotification,
  mapNotificationDataDto,
  mapNotificationListDto,
  sanitizeNotificationHref,
} from "./mappers";

export { demoNotifications, demoUnreadCount } from "./mock";

export {
  getUnreadNotificationCount,
  isNotificationApiDomain,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDomainForSurface,
} from "./api";

export {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotifications,
  useUnreadNotificationCount,
} from "./hooks";
