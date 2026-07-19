/**
 * Object DTO → safe view models (SEL-230).
 * Strip signed URLs before any cache/log path.
 */

import type { ObjectMetaDto } from "@/shared/api/schemas";
import type {
  StoreObjectMeta,
  StoreObjectStatus,
  StoreObjectVisibility,
} from "./contracts";

const SECRET_FIELD_RE =
  /upload[_-]?url|download[_-]?url|presign|signed[_-]?url|object[_-]?key|storage[_-]?key|bucket/i;

export function mapObjectStatus(raw: string): StoreObjectStatus {
  switch ((raw || "").trim().toUpperCase()) {
    case "UPLOADING":
      return "UPLOADING";
    case "SCANNING":
      return "SCANNING";
    case "READY":
      return "READY";
    case "REJECTED":
      return "REJECTED";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "UPLOADING";
  }
}

export function mapObjectVisibility(raw: string): StoreObjectVisibility {
  return (raw || "").trim().toUpperCase() === "PUBLIC" ? "PUBLIC" : "PRIVATE";
}

/** Map wire ObjectMeta → cache-safe view (no storage key / signed URL). */
export function mapObjectMetaDto(dto: ObjectMetaDto): StoreObjectMeta {
  return {
    id: dto.id,
    purpose: dto.purpose,
    visibility: mapObjectVisibility(dto.visibility),
    contentType: dto.contentType,
    ...(dto.expectedSizeBytes !== undefined
      ? { expectedSizeBytes: dto.expectedSizeBytes }
      : {}),
    ...(dto.sizeBytes !== undefined ? { sizeBytes: dto.sizeBytes } : {}),
    ...(dto.checksumSha256 ? { checksumSha256: dto.checksumSha256 } : {}),
    status: mapObjectStatus(dto.status),
    ...(dto.retentionClass ? { retentionClass: dto.retentionClass } : {}),
    storeId: dto.storeId,
    ...(dto.merchantId ? { merchantId: dto.merchantId } : {}),
    ...(dto.scanVerdict ? { scanVerdict: dto.scanVerdict } : {}),
    ...(dto.rejectedReason ? { rejectedReason: dto.rejectedReason } : {}),
    ...(dto.uploadExpiresAt ? { uploadExpiresAt: dto.uploadExpiresAt } : {}),
    ...(dto.createdAt ? { createdAt: dto.createdAt } : {}),
    ...(dto.updatedAt ? { updatedAt: dto.updatedAt } : {}),
  };
}

/** Guard: meta view must not carry capability secrets. */
export function assertNoSecretsInObjectMeta(meta: StoreObjectMeta): void {
  const flat = JSON.stringify(meta);
  if (SECRET_FIELD_RE.test(flat)) {
    throw new Error("Object meta must not include signed URL or storage key");
  }
}

/**
 * Redact any accidental secret fields for logs/telemetry.
 * Never log full upload/download URLs.
 */
export function redactObjectSecretsForLog(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_FIELD_RE.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && /https?:\/\/.+/i.test(v) && /X-Amz|Signature|presign/i.test(v)) {
      out[k] = "[redacted-url]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function formatObjectSizeBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatObjectUpdatedLabel(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return iso;
  }
}

/** Display filename from File or fallback from content type. */
export function displayFileName(file: File | null | undefined, fallback = "file"): string {
  if (file?.name?.trim()) return file.name.trim();
  return fallback;
}
