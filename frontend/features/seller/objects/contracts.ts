/**
 * Store object upload lifecycle view contracts (SEL-230).
 * Product/public assets only — not personal avatar (INT-175).
 */

export type StoreObjectPurpose = "PRODUCT_FILE" | "PUBLIC_ASSET";

export type StoreObjectStatus =
  "UPLOADING" | "SCANNING" | "READY" | "REJECTED" | "EXPIRED";

export type StoreObjectVisibility = "PRIVATE" | "PUBLIC";

/** Safe metadata for cache/UI — no signed URLs or storage keys. */
export type StoreObjectMeta = {
  id: string;
  purpose: string;
  visibility: StoreObjectVisibility;
  contentType: string;
  expectedSizeBytes?: number;
  sizeBytes?: number;
  /** Present after complete; safe to show as opaque hex, not a capability. */
  checksumSha256?: string;
  status: StoreObjectStatus;
  retentionClass?: string;
  storeId: string;
  merchantId?: string;
  scanVerdict?: string;
  rejectedReason?: string;
  uploadExpiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Presign result. `uploadUrl` is ephemeral secret — keep in memory only
 * for the immediate PUT; never put in query keys / localStorage / logs.
 */
export type StoreObjectUploadIntent = {
  object: StoreObjectMeta;
  /** Short-lived secret capability. */
  uploadUrl: string;
  uploadExpires: string;
  method: string;
};

export type CreateStoreObjectUploadInput = {
  storeId: string;
  purpose: StoreObjectPurpose;
  contentType: string;
  sizeBytes: number;
  expectedChecksumSha256?: string;
};

export type CompleteStoreObjectUploadInput = {
  storeId: string;
  objectId: string;
  checksumSha256: string;
};

export type GetStoreObjectMetaInput = {
  storeId: string;
  objectId: string;
};

/**
 * Full client lifecycle input (presign → PUT → complete → optional poll).
 * File bytes stay local; only opaque object id is returned.
 */
export type RunStoreObjectUploadInput = {
  storeId: string;
  purpose: StoreObjectPurpose;
  file: File;
  /** When false, skip bounded READY poll after complete (default true). */
  waitUntilReady?: boolean;
};

export type ClientFileValidationError = {
  kind: "size" | "mime" | "empty";
  message: string;
};

/** BE product file cap (100 MiB). UI copy may say 2 GB; client mirrors server. */
export const PRODUCT_FILE_MAX_BYTES = 100 * 1024 * 1024;
export const PUBLIC_ASSET_MAX_BYTES = 10 * 1024 * 1024;

export const PRODUCT_FILE_ALLOWED_MIME_HINT =
  "ZIP, PDF, PNG, and other non-executable product files";

export const PUBLIC_ASSET_ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export const PRODUCT_FILE_BLOCKED_MIMES = [
  "application/x-msdownload",
  "application/x-executable",
  "text/html",
  "application/xhtml+xml",
] as const;

/** Bounded poll for SCANNING → READY|REJECTED (ms). */
export const OBJECT_SCAN_POLL_INTERVAL_MS = 1_000;
export const OBJECT_SCAN_POLL_MAX_ATTEMPTS = 30;
