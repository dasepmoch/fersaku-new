/**
 * Inventory transport DTO → existing InventoryProduct / StockItem view (SEL-240).
 * Secrets never map into list/detail cache models.
 */

import type {
  InventoryFieldDefDto,
  InventoryProductSummaryDto,
  InventorySchemaDto,
  InventoryStockItemMaskedDto,
} from "@/shared/api/schemas";
import type {
  InventoryField,
  InventoryProduct,
  InventorySchemaView,
  StockItem,
  StockItemStatusLabel,
} from "./contracts";
import { DEFAULT_INVENTORY_LOW_AT } from "./contracts";

const SECRET_KEY_RE =
  /secret|password|passwd|pwd|token|credential|api[_-]?key|payload|encrypted/i;

/** Catalog wire type → existing inventory type label. */
export function mapInventoryProductTypeLabel(wireType: string | undefined): string {
  const t = (wireType || "").trim().toLowerCase();
  if (t === "code") return "Single code";
  if (t === "download") return "Download";
  if (t === "link") return "Link";
  if (t.includes("credential") || t === "structured credentials") {
    return "Structured credentials";
  }
  if (!t) return "Inventory";
  return wireType!.trim();
}

/** Wire stock status → UI Status labels (Sold = DELIVERED; Invalid = REVOKED). */
export function mapStockItemStatus(wire: string): StockItemStatusLabel {
  switch ((wire || "").trim().toUpperCase()) {
    case "AVAILABLE":
      return "Available";
    case "RESERVED":
      return "Reserved";
    case "DELIVERED":
      return "Sold";
    case "REVOKED":
      return "Invalid";
    default:
      return "Invalid";
  }
}

function formatStockCreatedAt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return iso;
  }
}

export function mapInventoryFieldDef(dto: InventoryFieldDefDto): InventoryField {
  return {
    key: dto.key,
    label: dto.label,
    secret: Boolean(dto.secret),
    required: Boolean(dto.required),
    buyerCopyable: dto.buyerCopyable !== false,
  };
}

export function mapInventorySchemaDto(dto: InventorySchemaDto): InventorySchemaView {
  return {
    id: dto.id,
    productId: dto.productId,
    storeId: dto.storeId,
    version: dto.version,
    fields: (dto.fields || []).map(mapInventoryFieldDef),
    delimiter: dto.delimiter || "|",
    checksum: dto.checksum,
    createdAt: dto.createdAt,
  };
}

/**
 * Summary → InventoryProduct. BE has no lowAt/delivery string yet:
 * lowAt defaults; delivery is empty until schema is loaded client-side.
 */
export function mapInventoryProductSummaryDto(
  dto: InventoryProductSummaryDto,
  options?: { delivery?: string; lowAt?: number },
): InventoryProduct {
  return {
    id: dto.productId,
    title: dto.title || dto.productId,
    type: mapInventoryProductTypeLabel(dto.type),
    available: Number(dto.available) || 0,
    reserved: Number(dto.reserved) || 0,
    sold: Number(dto.delivered) || 0,
    invalid: Number(dto.revoked) || 0,
    lowAt: options?.lowAt ?? DEFAULT_INVENTORY_LOW_AT,
    delivery: options?.delivery ?? "",
    activeSchemaVersion: dto.activeSchemaVersion ?? null,
    storeId: dto.storeId,
    total: Number(dto.total) || 0,
  };
}

/**
 * Masked stock row. `masked` may contain non-secret previews only;
 * secret fields stay masked placeholders from BE.
 */
export function mapInventoryStockItemMaskedDto(
  dto: InventoryStockItemMaskedDto,
): StockItem {
  const values: Record<string, string> = {};
  const masked = dto.masked || {};
  for (const [k, v] of Object.entries(masked)) {
    if (SECRET_KEY_RE.test(k)) {
      values[k] = typeof v === "string" && v.includes("•") ? v : "••••••••";
      continue;
    }
    values[k] = typeof v === "string" ? v : String(v ?? "");
  }
  return {
    id: dto.id,
    values,
    status: mapStockItemStatus(dto.status),
    createdAt: formatStockCreatedAt(dto.createdAt),
  };
}

export function deliveryStringFromFields(fields: InventoryField[]): string {
  return fields.map((f) => f.key).filter(Boolean).join("|");
}

export function fieldsToPutBody(fields: InventoryField[]): InventoryFieldDefDto[] {
  return fields.map((f) => ({
    key: f.key.trim(),
    label: f.label.trim(),
    secret: Boolean(f.secret),
    required: Boolean(f.required),
    buyerCopyable: Boolean(f.buyerCopyable),
  }));
}

/** Parse pipe-delimited bulk import lines into field maps (preview/import). */
export function parseImportLines(
  raw: string,
  fields: InventoryField[],
  delimiter = "|",
): Record<string, string>[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const parts = line.split(delimiter);
    const row: Record<string, string> = {};
    fields.forEach((f, i) => {
      row[f.key] = (parts[i] ?? "").trim();
    });
    return row;
  });
}

const FORBIDDEN_CACHE_KEYS = [
  "secrets",
  "encrypted_payload",
  "encryptedPayload",
  "password",
  "credential",
  "rawSecret",
  "plaintext",
] as const;

/** Guard: list/detail product never carries secret bags. */
export function assertNoSecretsInInventoryProduct(product: InventoryProduct): void {
  const json = JSON.stringify(product);
  for (const key of FORBIDDEN_CACHE_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Inventory product must not contain secret key: ${key}`);
    }
  }
  if ("secrets" in (product as object)) {
    throw new Error("Inventory product must not contain secrets");
  }
}

/**
 * Guard: cache models never carry a secrets bag / ciphertext.
 * Per-field masking is BE responsibility; list values may include non-secret previews.
 */
export function assertNoSecretsInStockItems(items: StockItem[]): void {
  for (const item of items) {
    const rec = item as unknown as Record<string, unknown>;
    if ("secrets" in rec && rec.secrets != null) {
      throw new Error(`Stock item ${item.id} must not contain secrets bag`);
    }
    if ("encryptedPayload" in rec || "encrypted_payload" in rec) {
      throw new Error(`Stock item ${item.id} must not contain ciphertext`);
    }
  }
}

export function redactRevealForLog(result: {
  itemId: string;
  productId: string;
  auditId: string;
  secrets?: Record<string, string>;
}): Record<string, unknown> {
  return {
    itemId: result.itemId,
    productId: result.productId,
    auditId: result.auditId,
    secretKeys: result.secrets ? Object.keys(result.secrets) : [],
  };
}
