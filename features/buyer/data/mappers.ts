/**
 * Buyer purchase transport DTO → existing BuyerPurchase view (BUY-100 / UI-040).
 * Base list/detail never include delivery secrets (CHK-140 access is separate).
 */

import type {
  BuyerPurchaseDetailDto,
  BuyerPurchaseItemDto,
  BuyerPurchaseSummaryDto,
} from "@/shared/api/schemas";
import {
  invalidApiContract,
  requireSafeMoneyIdr,
} from "@/shared/api/mappers";
import type { BuyerPurchase, BuyerPurchaseDeliveryType } from "./contracts";

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

/** Assert a purchase view model has no raw secret-like fields in list path. */
export function assertNoDeliverySecretsInListItem(
  purchase: BuyerPurchase,
): void {
  if (purchase.credentialFields?.some((f) => f.value && f.secret)) {
    return invalidApiContract("List purchase must not carry credential secrets", {
      issues: [{ path: "credentialFields", message: "secret present" }],
    });
  }
  if (purchase.code?.value && purchase.code.value.length > 0) {
    // List must not include codes; empty redacted shell only allowed on detail.
    return invalidApiContract("List purchase must not carry code values", {
      issues: [{ path: "code.value", message: "secret present" }],
    });
  }
}
