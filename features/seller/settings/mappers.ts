/**
 * SEL-340 — transport DTO → existing seller settings view models.
 * Never maps full bank account numbers or avatar upload.
 */

import type {
  BankAccountDto,
  BuyerProfileDto,
  BuyerSessionDto,
  NotificationPrefDto,
} from "@/shared/api/schemas";
import { invalidApiContract } from "@/shared/api/mappers";
import type {
  SellerBankAccount,
  SellerProfile,
  SellerSession,
} from "./contracts";

/** Initials from display name for static avatar (no photo — INT-175). */
export function profileInitials(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) {
    const w = parts[0];
    return (w.slice(0, 2) || "—").toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function localeToDisplayLabel(locale: string): string {
  const l = locale.trim().toLowerCase();
  if (l === "id-id" || l === "id" || l.startsWith("id-")) {
    return "Bahasa Indonesia";
  }
  if (l === "en-us" || l === "en" || l.startsWith("en-")) {
    return "English";
  }
  return locale.trim() || "Bahasa Indonesia";
}

export function displayLabelToLocale(label: string): string {
  const t = label.trim().toLowerCase();
  if (t.includes("indonesia") || t === "id" || t === "id-id") return "id-ID";
  if (t.includes("english") || t === "en" || t === "en-us") return "en-US";
  return label.trim() || "id-ID";
}

/**
 * Closed-schema prefs → existing seller Notifikasi toggle labels.
 * Labels without BE event codes default true (local draft only).
 */
export function mapNotificationPrefsToSellerToggles(
  prefs: NotificationPrefDto[],
): Pick<
  SellerProfile,
  | "saleSuccess"
  | "paymentPending"
  | "lowStock"
  | "payoutChange"
  | "newDeviceLogin"
  | "weeklySummary"
> {
  let saleSuccess = true;
  let payoutChange = true;
  let newDeviceLogin = true;
  let weeklySummary = true;
  for (const p of prefs) {
    if (p.channel !== "EMAIL" && p.channel !== "IN_APP") continue;
    if (p.eventCode === "PAYMENT_RECEIPT" && p.channel === "EMAIL") {
      saleSuccess = Boolean(p.enabled) || Boolean(p.mandatory);
    }
    if (p.eventCode === "WITHDRAWAL_UPDATE") {
      payoutChange = Boolean(p.enabled);
    }
    if (p.eventCode === "SECURITY_ALERT") {
      newDeviceLogin = Boolean(p.enabled);
    }
    if (p.eventCode === "MARKETING_NEWSLETTER" && p.channel === "EMAIL") {
      weeklySummary = Boolean(p.enabled);
    }
  }
  return {
    saleSuccess,
    // No closed BE event for payment-pending / low-stock — local draft defaults.
    paymentPending: false,
    lowStock: true,
    payoutChange,
    newDeviceLogin,
    weeklySummary,
  };
}

/**
 * BE ProfileData (/v1/me/profile) → existing SellerProfile view.
 * Avatar never mapped as uploadable media (INT-175 DISABLED).
 */
export function mapSellerProfileDto(
  dto: BuyerProfileDto,
  prefs?: NotificationPrefDto[],
): SellerProfile {
  const displayName = (dto.displayName || dto.name || "").trim();
  if (!displayName) {
    return invalidApiContract("Seller profile missing displayName", {
      issues: [{ path: "displayName", message: "empty" }],
    });
  }
  const version = Math.trunc(dto.version);
  if (version < 1) {
    return invalidApiContract("Seller profile version invalid", {
      issues: [{ path: "version", message: String(dto.version) }],
    });
  }
  const toggles = mapNotificationPrefsToSellerToggles(prefs ?? []);
  const tz = dto.timezone.trim() || "Asia/Jakarta";
  return {
    displayName,
    email: dto.email.trim(),
    locale: dto.locale.trim() || "id-ID",
    localeLabel: localeToDisplayLabel(dto.locale),
    timezone: tz.includes("GMT") || tz.includes("(") ? tz : formatTimezoneLabel(tz),
    revision: version,
    initials: profileInitials(displayName),
    ...toggles,
  };
}

function formatTimezoneLabel(tz: string): string {
  if (tz === "Asia/Jakarta" || tz.startsWith("Asia/Jakarta")) {
    return "Asia/Jakarta (GMT+7)";
  }
  return tz;
}

/** Wire timezone for PATCH — strip display suffix. */
export function displayTimezoneToWire(label: string): string {
  const t = label.trim();
  if (t.startsWith("Asia/Jakarta")) return "Asia/Jakarta";
  const paren = t.indexOf(" (");
  if (paren > 0) return t.slice(0, paren).trim();
  return t || "Asia/Jakarta";
}

/** Extract last 4 digits from masked account string. */
export function last4FromMasked(masked: string): string {
  const digits = masked.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return digits || "····";
}

/**
 * BE bankDTO → existing bank card.
 * Full account number never present on DTO; fail closed if it appears.
 */
export function mapBankAccountDto(dto: BankAccountDto): SellerBankAccount {
  const id = dto.id.trim();
  if (!id) {
    return invalidApiContract("Bank account missing id", {
      issues: [{ path: "id", message: "empty" }],
    });
  }
  // Guard: transport must never carry raw account number fields.
  const raw = dto as BankAccountDto & { accountNumber?: string };
  if (raw.accountNumber && String(raw.accountNumber).length > 0) {
    return invalidApiContract("Bank account must not expose full accountNumber", {
      issues: [{ path: "accountNumber", message: "forbidden" }],
    });
  }
  const status = dto.status.trim().toUpperCase();
  const verified = status === "VERIFIED";
  const bank =
    (dto.bankName || dto.bankCode || "").trim() || dto.bankCode;
  const version = Math.trunc(dto.version);
  if (version < 1) {
    return invalidApiContract("Bank account version invalid", {
      issues: [{ path: "version", message: String(dto.version) }],
    });
  }
  const numberMasked = dto.accountNumberMasked.trim();
  return {
    id,
    bank,
    bankCode: dto.bankCode.trim(),
    numberMasked,
    numberLast4: last4FromMasked(numberMasked),
    holder: dto.accountHolderName.trim().toUpperCase(),
    verified,
    primary: Boolean(dto.isPrimary),
    revision: version,
    status,
  };
}

export function mapBankAccountListDto(
  items: BankAccountDto[],
): SellerBankAccount[] {
  return items.map(mapBankAccountDto);
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
  if (diffMs < 60_000) return "Sekarang";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export function mapSellerSessionDto(dto: BuyerSessionDto): SellerSession {
  const id = dto.id.trim();
  if (!id) {
    return invalidApiContract("Seller session missing id", {
      issues: [{ path: "id", message: "empty" }],
    });
  }
  const device =
    sanitizeSessionDisplayText(dto.deviceLabel) || "Perangkat tidak dikenal";
  return {
    id,
    device,
    location: "—",
    ip: "—",
    active: formatSessionActiveLabel(
      typeof dto.lastSeenAt === "string"
        ? dto.lastSeenAt
        : String(dto.lastSeenAt),
    ),
    current: Boolean(dto.current),
  };
}

export function mapSellerSessionListDto(
  sessions: BuyerSessionDto[],
): SellerSession[] {
  return sessions.map(mapSellerSessionDto);
}

/** Assert view models never carry raw account numbers or password material. */
export function assertNoBankSecretsInView(account: SellerBankAccount): void {
  const flat = JSON.stringify(account);
  if (/"accountNumber"\s*:/.test(flat) && !flat.includes("numberMasked")) {
    return invalidApiContract("View must not carry full accountNumber", {
      issues: [{ path: "accountNumber", message: "present" }],
    });
  }
  // Masked only: last4 is short; reject long digit runs (full numbers).
  if (/\d{8,}/.test(account.numberMasked.replace(/\s/g, ""))) {
    return invalidApiContract("Masked account looks unmasked", {
      issues: [{ path: "numberMasked", message: "too many digits" }],
    });
  }
}
