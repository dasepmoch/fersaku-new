/**
 * Buyer purchase transport DTO → existing BuyerPurchase view (BUY-100 / UI-040).
 * Base list/detail never include delivery secrets (CHK-140 access is separate).
 */

import type {
  BuyerProfileDto,
  BuyerPurchaseDetailDto,
  BuyerPurchaseItemDto,
  BuyerPurchaseSummaryDto,
  BuyerReviewDto,
  BuyerSessionDto,
  NotificationPrefDto,
} from "@/shared/api/schemas";
import { invalidApiContract, requireSafeMoneyIdr } from "@/shared/api/mappers";
import type {
  BuyerProfile,
  BuyerPurchase,
  BuyerPurchaseDeliveryType,
  BuyerReview,
  BuyerSession,
} from "./contracts";

const DISPLAY_PALETTE = "#eef3e9";
const DISPLAY_GLYPH = "•";

function formatPurchasedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return iso;
  }
}

function mapPaymentStatus(status: string): BuyerPurchase["status"] {
  const u = status.trim().toUpperCase();
  if (u === "PAID") return "Paid";
  return "Pending";
}

/**
 * Map BE deliveryKind / productType → existing UI deliveryType.
 * Secrets never populated here — only redacted type metadata.
 */
export function mapDeliveryKindToType(
  kind: string | undefined,
  productType?: string,
): BuyerPurchaseDeliveryType {
  const raw = (kind || productType || "").trim().toUpperCase();
  if (raw === "DOWNLOAD" || raw === "FILE") return "download";
  if (raw === "PROTECTED_LINK" || raw === "LINK") return "link";
  if (raw === "CREDENTIAL" || raw === "CREDENTIALS") return "credentials";
  if (raw === "CODE") return "code";
  const lower = (kind || productType || "").trim().toLowerCase();
  if (lower === "download" || lower === "link" || lower === "code") {
    return lower;
  }
  if (lower === "credentials" || lower === "credential") return "credentials";
  return "download";
}

function primaryItem(detail: BuyerPurchaseDetailDto): BuyerPurchaseItemDto {
  if (!detail.items.length) {
    return invalidApiContract("Buyer purchase detail has no items", {
      issues: [{ path: "items", message: "empty" }],
    });
  }
  return detail.items[0];
}

function baseFromSummary(dto: BuyerPurchaseSummaryDto): BuyerPurchase {
  const price = requireSafeMoneyIdr(dto.grossIdr, "grossIdr");
  const when = dto.paidAt || dto.createdAt;
  const deliveryType = mapDeliveryKindToType(dto.deliveryKind, dto.productType);
  return {
    orderId: dto.orderNumber || dto.orderId,
    internalOrderId: dto.orderId,
    productId: dto.productId || "",
    product: dto.productTitle || dto.orderNumber,
    seller: dto.storeName || "Seller",
    sellerSlug: dto.storeSlug || "",
    price,
    purchasedAt: formatPurchasedAt(
      typeof when === "string" ? when : String(when),
    ),
    status: mapPaymentStatus(dto.paymentStatus),
    deliveryType,
    palette: DISPLAY_PALETTE,
    glyph: DISPLAY_GLYPH,
    version: dto.productVersion || undefined,
    sellerUpdatesEnabled: false,
  };
}

/** List row: redacted metadata only (no downloads/link/credentials/code secrets). */
export function mapBuyerPurchaseSummaryDto(
  dto: BuyerPurchaseSummaryDto,
): BuyerPurchase {
  return baseFromSummary(dto);
}

export function mapBuyerPurchaseSummaryListDto(
  rows: BuyerPurchaseSummaryDto[],
): BuyerPurchase[] {
  return rows.map(mapBuyerPurchaseSummaryDto);
}

/**
 * Detail: redacted delivery capability metadata only.
 * Raw secrets / signed URLs / credentials never mapped (CHK-140).
 */
export function mapBuyerPurchaseDetailDto(
  dto: BuyerPurchaseDetailDto,
): BuyerPurchase {
  const item = primaryItem(dto);
  const price = requireSafeMoneyIdr(dto.grossIdr, "grossIdr");
  const when = dto.paidAt || dto.createdAt;
  const deliveryType = mapDeliveryKindToType(
    item.deliveryKind,
    item.productType,
  );
  const base: BuyerPurchase = {
    orderId: dto.orderNumber || dto.orderId,
    internalOrderId: dto.orderId,
    orderItemId: item.orderItemId,
    productId: item.productId,
    product: item.productTitle,
    seller: dto.storeName || "Seller",
    sellerSlug: dto.storeSlug || "",
    price,
    purchasedAt: formatPurchasedAt(
      typeof when === "string" ? when : String(when),
    ),
    status: mapPaymentStatus(dto.paymentStatus),
    deliveryType,
    palette: DISPLAY_PALETTE,
    glyph: DISPLAY_GLYPH,
    version: item.productVersion || undefined,
    sellerUpdatesEnabled: false,
  };

  // Redacted delivery shells — structure for UI geometry; no secret values.
  if (deliveryType === "download") {
    return {
      ...base,
      downloads: {
        used: 0,
        max: 0,
        expiresAt: "—",
        fileName: item.productTitle,
        fileSize: "—",
      },
    };
  }
  if (deliveryType === "link") {
    return {
      ...base,
      protectedLink: {
        label: "Akses terlindungi",
        host: "—",
      },
    };
  }
  if (deliveryType === "credentials") {
    return {
      ...base,
      credentialFields: [],
    };
  }
  if (deliveryType === "code") {
    return {
      ...base,
      code: {
        value: "",
        status: "Assigned",
        instructions:
          "Kode tersedia setelah akses delivery. Gunakan tombol akses produk.",
      },
    };
  }
  return base;
}

/** Map BE buyer ReviewView → UI review (no status invent / no optimistic publish). */
export function mapBuyerReviewDto(dto: BuyerReviewDto): BuyerReview {
  const rating = Math.trunc(dto.rating);
  if (rating < 1 || rating > 5) {
    return invalidApiContract("Buyer review rating out of range", {
      issues: [{ path: "rating", message: String(dto.rating) }],
    });
  }
  return {
    id: dto.id,
    orderItemId: dto.orderItemId || undefined,
    productId: dto.productId,
    rating,
    title: dto.title ?? "",
    body: dto.body ?? "",
    status: dto.status,
    verifiedPurchase: Boolean(dto.verifiedPurchase),
    contentVersion: Math.max(1, Math.trunc(dto.contentVersion)),
  };
}

/** Assert a purchase view model has no raw secret-like fields in list path. */
export function assertNoDeliverySecretsInListItem(
  purchase: BuyerPurchase,
): void {
  if (purchase.credentialFields?.some((f) => f.value && f.secret)) {
    return invalidApiContract(
      "List purchase must not carry credential secrets",
      {
        issues: [{ path: "credentialFields", message: "secret present" }],
      },
    );
  }
  if (purchase.code?.value && purchase.code.value.length > 0) {
    // List must not include codes; empty redacted shell only allowed on detail.
    return invalidApiContract("List purchase must not carry code values", {
      issues: [{ path: "code.value", message: "secret present" }],
    });
  }
}

/** Untrusted device/location text: strip control chars; React still escapes render. */
export function sanitizeSessionDisplayText(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

/**
 * Relative last-seen label for existing security UI (`active` field).
 * Uses id-ID style phrases matching mock geometry ("Sekarang", "N jam lalu").
 */
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

/**
 * BE SessionView → existing BuyerSession view.
 * current is backend session-id equality only (never device guess).
 * location/ip: privacy mask — BE buyer list has no raw IP; show "—".
 * nowMs is injectable so labels stay deterministic in tests.
 */
export function mapBuyerSessionDto(
  dto: BuyerSessionDto,
  nowMs: number = Date.now(),
): BuyerSession {
  const id = dto.id.trim();
  if (!id) {
    return invalidApiContract("Buyer session missing id", {
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
      nowMs,
    ),
    current: Boolean(dto.current),
  };
}

export function mapBuyerSessionListDto(
  sessions: BuyerSessionDto[],
  nowMs: number = Date.now(),
): BuyerSession[] {
  return sessions.map((s) => mapBuyerSessionDto(s, nowMs));
}

/** Initials from display name for static avatar circle (no photo — INT-175). */
export function profileInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) {
    const w = parts[0];
    return (w.slice(0, 2) || "—").toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/** Map BCP-47 locale to existing Bahasa field label. */
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

/** Map display label back to wire locale for PATCH. */
export function displayLabelToLocale(label: string): string {
  const t = label.trim().toLowerCase();
  if (t.includes("indonesia") || t === "id" || t === "id-id") return "id-ID";
  if (t.includes("english") || t === "en" || t === "en-us") return "en-US";
  return label.trim() || "id-ID";
}

/**
 * Closed-schema prefs → existing buyer Preference toggles.
 * PAYMENT_RECEIPT EMAIL is mandatory (always on).
 * MARKETING_NEWSLETTER EMAIL is the only optional marketing toggle.
 * Product-update toggle has no BE event — default true local only.
 */
export function mapNotificationPrefsToBuyerToggles(
  prefs: NotificationPrefDto[],
): Pick<
  BuyerProfile,
  "receiptEmail" | "marketingEmail" | "productUpdatesEmail"
> {
  let marketingEmail = false;
  for (const p of prefs) {
    if (p.channel !== "EMAIL") continue;
    if (p.eventCode === "MARKETING_NEWSLETTER") {
      marketingEmail = Boolean(p.enabled);
    }
  }
  return {
    receiptEmail: true, // mandatory PAYMENT_RECEIPT — never disable in UI
    marketingEmail,
    productUpdatesEmail: true, // no closed BE event; local non-server draft default
  };
}

/**
 * BE ProfileData → existing BuyerProfile view.
 * Does not invent avatar upload or email-change flow.
 */
export function mapBuyerProfileDto(
  dto: BuyerProfileDto,
  prefs?: NotificationPrefDto[],
): BuyerProfile {
  const name = (dto.displayName || dto.name || "").trim();
  if (!name) {
    return invalidApiContract("Buyer profile missing displayName", {
      issues: [{ path: "displayName", message: "empty" }],
    });
  }
  const version = Math.trunc(dto.version);
  if (version < 1) {
    return invalidApiContract("Buyer profile version invalid", {
      issues: [{ path: "version", message: String(dto.version) }],
    });
  }
  const toggles = mapNotificationPrefsToBuyerToggles(prefs ?? []);
  return {
    name,
    email: dto.email.trim(),
    phone: (dto.phone ?? "").trim(),
    locale: dto.locale.trim() || "id-ID",
    localeLabel: localeToDisplayLabel(dto.locale),
    timezone: dto.timezone.trim() || "Asia/Jakarta",
    revision: version,
    initials: profileInitials(name),
    memberSinceLabel: "",
    ...toggles,
  };
}
