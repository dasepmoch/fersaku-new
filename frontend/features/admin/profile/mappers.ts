/**
 * ADM-230 — transport DTO → existing admin profile view models.
 * Never maps avatar upload or recovery codes into cacheable views.
 */

import type {
  BuyerProfileDto,
  BuyerSessionDto,
  NotificationPrefDto,
} from "@/shared/api/schemas";
import { invalidApiContract } from "@/shared/api/mappers";
import type { AdminProfile, AdminSession } from "./contracts";

/** Initials from display name for static avatar (no photo — INT-175). */
export function profileInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) {
    const w = parts[0];
    return (w.slice(0, 2) || "—").toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/**
 * Closed-schema prefs → existing admin Personal notifications toggles.
 */
export function mapNotificationPrefsToAdminToggles(
  prefs: NotificationPrefDto[],
): Pick<AdminProfile, "kyc" | "withdrawals" | "incidents" | "digest"> {
  let kyc = true;
  let withdrawals = true;
  let incidents = true;
  let digest = false;
  for (const p of prefs) {
    if (p.channel !== "EMAIL" && p.channel !== "IN_APP") continue;
    if (p.eventCode === "KYC_UPDATE") {
      kyc = Boolean(p.enabled);
    }
    if (p.eventCode === "WITHDRAWAL_UPDATE") {
      withdrawals = Boolean(p.enabled);
    }
    if (p.eventCode === "SECURITY_ALERT") {
      incidents = Boolean(p.enabled);
    }
    if (p.eventCode === "MARKETING_NEWSLETTER" && p.channel === "EMAIL") {
      digest = Boolean(p.enabled);
    }
  }
  return { kyc, withdrawals, incidents, digest };
}

/**
 * BE ProfileData (/v1/me/profile) → existing AdminProfile view.
 * Avatar never mapped as uploadable media (INT-175 DISABLED).
 * jobTitle has no closed BE field — empty on API; mock seeds separately.
 */
export function mapAdminProfileDto(
  dto: BuyerProfileDto,
  prefs?: NotificationPrefDto[],
  jobTitle = "",
): AdminProfile {
  const fullName = (dto.displayName || dto.name || "").trim();
  if (!fullName) {
    return invalidApiContract("Admin profile missing displayName", {
      issues: [{ path: "displayName", message: "empty" }],
    });
  }
  const version = Math.trunc(dto.version);
  if (version < 1) {
    return invalidApiContract("Admin profile version invalid", {
      issues: [{ path: "version", message: String(dto.version) }],
    });
  }
  const toggles = mapNotificationPrefsToAdminToggles(prefs ?? []);
  const tz = dto.timezone.trim() || "Asia/Jakarta";
  return {
    fullName,
    email: dto.email.trim(),
    jobTitle: jobTitle.trim(),
    timezone:
      tz.includes("GMT") || tz.includes("(") ? stripTimezoneLabel(tz) : tz,
    revision: version,
    initials: profileInitials(fullName),
    mfaEnabled: Boolean(dto.mfaEnabled),
    ...toggles,
  };
}

function stripTimezoneLabel(label: string): string {
  const t = label.trim();
  if (t.startsWith("Asia/Jakarta")) return "Asia/Jakarta";
  const paren = t.indexOf(" (");
  if (paren > 0) return t.slice(0, paren).trim();
  return t;
}

/** Wire timezone for PATCH — strip display suffix. */
export function displayTimezoneToWire(label: string): string {
  return stripTimezoneLabel(label) || "Asia/Jakarta";
}

export function sanitizeSessionDisplayText(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

export function formatSessionActiveLabel(
  lastSeenAt: string,
  nowMs: number = Date.now(),
): string {
  const d = new Date(lastSeenAt);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Math.max(0, nowMs - d.getTime());
  if (diffMs < 60_000) return "Now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function mapAdminSessionDto(dto: BuyerSessionDto): AdminSession {
  const id = dto.id.trim();
  if (!id) {
    return invalidApiContract("Admin session missing id", {
      issues: [{ path: "id", message: "empty" }],
    });
  }
  const device =
    sanitizeSessionDisplayText(dto.deviceLabel) || "Unknown device";
  return {
    id,
    device,
    ip: "—",
    active: formatSessionActiveLabel(
      typeof dto.lastSeenAt === "string"
        ? dto.lastSeenAt
        : String(dto.lastSeenAt),
    ),
    current: Boolean(dto.current),
  };
}

export function mapAdminSessionListDto(
  sessions: BuyerSessionDto[],
): AdminSession[] {
  return sessions.map(mapAdminSessionDto);
}
