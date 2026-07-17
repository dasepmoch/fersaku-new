/**
 * Mock store object fixtures (sellerCatalog mock path only).
 * Screens must not import this module directly (INT-170).
 */

import type { StoreObjectMeta, StoreObjectUploadIntent } from "./contracts";

export function mockObjectMeta(
  storeId: string,
  overrides: Partial<StoreObjectMeta> = {},
): StoreObjectMeta {
  const id = overrides.id ?? `mock_obj_${Date.now().toString(36)}`;
  return {
    id,
    purpose: "PRODUCT_FILE",
    visibility: "PRIVATE",
    contentType: "application/zip",
    expectedSizeBytes: 48_200_000,
    sizeBytes: 48_200_000,
    checksumSha256: "a".repeat(64),
    status: "READY",
    storeId,
    createdAt: "2026-07-02T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    ...overrides,
  };
}

export function mockUploadIntent(
  storeId: string,
  overrides: Partial<StoreObjectMeta> = {},
): StoreObjectUploadIntent {
  const object = mockObjectMeta(storeId, {
    status: "UPLOADING",
    sizeBytes: undefined,
    checksumSha256: undefined,
    ...overrides,
  });
  return {
    object,
    // Mock never performs a real PUT; empty secret placeholder is not used.
    uploadUrl: "",
    uploadExpires: new Date(Date.now() + 15 * 60_000).toISOString(),
    method: "PUT",
  };
}
