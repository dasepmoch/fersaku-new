import {
  Bell,
  Check,
  CreditCard,
  KeyRound,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { NotificationDataDto } from "@/shared/api/schemas";
import {
  homePathForSurface,
  sanitizeReturnToForSurface,
} from "@/shared/auth/return-to";
import type { SessionSurface } from "@/shared/auth/session-model";
import type {
  NotificationItemView,
  NotificationListView,
  NotificationSurface,
} from "./contracts";

const EVENT_ICONS: Record<string, LucideIcon> = {
  SECURITY_ALERT: ShieldCheck,
  PAYMENT_RECEIPT: ShoppingBag,
  KYC_UPDATE: KeyRound,
  WITHDRAWAL_UPDATE: WalletCards,
  MARKETING_NEWSLETTER: Sparkles,
};

const SURFACE_FALLBACK_ICONS: Record<NotificationSurface, LucideIcon> = {
  seller: ShoppingBag,
  admin: CreditCard,
  buyer: Check,
};

/**
 * Map server ctaPath to allowlisted internal route for the shell surface.
 * External / cross-surface / javascript targets → surface home (never arbitrary URL).
 */
export function sanitizeNotificationHref(
  ctaPath: string | null | undefined,
  surface: NotificationSurface,
): string {
  const sessionSurface = surface as SessionSurface;
  const safe = sanitizeReturnToForSurface(ctaPath, sessionSurface);
  return safe ?? homePathForSurface(sessionSurface);
}

/** Relative time label for shell rows (no new chrome). */
export function formatNotificationTime(
  createdAt: string,
  nowMs = Date.now(),
): string {
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return createdAt;
  const deltaSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (deltaSec < 60) return "Baru saja";
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `${mins} menit`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Kemarin";
  if (days < 7) return `${days} hari`;
  const d = new Date(ts);
  const day = d.getUTCDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const month = months[d.getUTCMonth()] ?? "";
  return `${day} ${month}`;
}

export function iconForNotification(
  eventCode: string,
  surface: NotificationSurface,
): LucideIcon {
  return EVENT_ICONS[eventCode] ?? SURFACE_FALLBACK_ICONS[surface] ?? Bell;
}

export function mapNotificationDataDto(
  dto: NotificationDataDto,
  surface: NotificationSurface,
  nowMs?: number,
): NotificationItemView {
  return {
    id: dto.id,
    title: dto.title,
    body: dto.body,
    time: formatNotificationTime(dto.createdAt, nowMs),
    href: sanitizeNotificationHref(dto.ctaPath, surface),
    icon: iconForNotification(dto.eventCode, surface),
    unread: dto.unread,
    eventCode: dto.eventCode,
  };
}

export function mapNotificationListDto(
  rows: NotificationDataDto[],
  surface: NotificationSurface,
  nowMs?: number,
): NotificationListView {
  const items = rows.map((row) => mapNotificationDataDto(row, surface, nowMs));
  const unreadCount = items.reduce((n, item) => n + (item.unread ? 1 : 0), 0);
  return { items, unreadCount };
}

/** Reject cross-surface leakage when BE surface field disagrees with shell. */
export function filterNotificationsForSurface(
  rows: NotificationDataDto[],
  surface: NotificationSurface,
): NotificationDataDto[] {
  const expected = surface.toUpperCase();
  return rows.filter((row) => row.surface === expected);
}
