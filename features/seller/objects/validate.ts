/**
 * Client-side file bounds for immediate UX feedback (SEL-230).
 * Server re-validates magic-byte/size/checksum.
 */

import {
  PRODUCT_FILE_BLOCKED_MIMES,
  PRODUCT_FILE_MAX_BYTES,
  PUBLIC_ASSET_ALLOWED_MIMES,
  PUBLIC_ASSET_MAX_BYTES,
  type ClientFileValidationError,
  type StoreObjectPurpose,
} from "./contracts";

function normalizeMime(ct: string): string {
  const lower = ct.trim().toLowerCase();
  const semi = lower.indexOf(";");
  return semi >= 0 ? lower.slice(0, semi).trim() : lower;
}

export function maxBytesForPurpose(purpose: StoreObjectPurpose): number {
  return purpose === "PUBLIC_ASSET"
    ? PUBLIC_ASSET_MAX_BYTES
    : PRODUCT_FILE_MAX_BYTES;
}

export function isMimeAllowedForPurpose(
  purpose: StoreObjectPurpose,
  contentType: string,
): boolean {
  const ct = normalizeMime(contentType);
  if (!ct || ct.length > 128) return false;
  if (purpose === "PUBLIC_ASSET") {
    return (PUBLIC_ASSET_ALLOWED_MIMES as readonly string[]).includes(ct);
  }
  return !(PRODUCT_FILE_BLOCKED_MIMES as readonly string[]).includes(ct);
}

/**
 * Validate file before presign. Returns null when OK.
 */
export function validateClientFile(
  file: File,
  purpose: StoreObjectPurpose,
): ClientFileValidationError | null {
  if (!file || file.size <= 0) {
    return { kind: "empty", message: "File kosong atau tidak valid." };
  }
  const max = maxBytesForPurpose(purpose);
  if (file.size > max) {
    const mb = Math.floor(max / (1024 * 1024));
    return {
      kind: "size",
      message: `Ukuran file melebihi batas ${mb} MB.`,
    };
  }
  const mime = file.type || "application/octet-stream";
  if (!isMimeAllowedForPurpose(purpose, mime)) {
    return {
      kind: "mime",
      message:
        purpose === "PUBLIC_ASSET"
          ? "Tipe file tidak diizinkan (gunakan PNG, JPEG, WebP, GIF, atau SVG)."
          : "Tipe file tidak diizinkan untuk produk digital.",
    };
  }
  return null;
}
