import type { z } from "zod";
import { apiRequest, ApiError } from "@/shared/api/http-client";
import {
  inventoryImportEnvelopeSchema,
  inventoryProductDetailEnvelopeSchema,
  inventoryProductSummaryListEnvelopeSchema,
  inventoryRevealEnvelopeSchema,
  inventorySchemaEnvelopeSchema,
  inventoryStockItemEnvelopeSchema,
} from "@/shared/api/schemas";
import { classifyApiError } from "@/shared/api/error-policy";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import {
  getDomainSource,
  shouldUseMockFixtures,
} from "@/shared/data/domain-source";
import type {
  ImportInventoryItemsInput,
  InventoryImportResult,
  InventoryProduct,
  InventoryProductDetail,
  InventoryRevealResult,
  InventorySchemaView,
  PutInventorySchemaInput,
  RevealInventoryItemInput,
  RevokeInventoryItemInput,
  StockItem,
} from "./contracts";
import { SELLER_INVENTORY_LIST_LIMIT } from "./contracts";
import {
  assertNoSecretsInInventoryProduct,
  assertNoSecretsInStockItems,
  fieldsToPutBody,
  mapInventoryProductSummaryDto,
  mapInventorySchemaDto,
  mapInventoryStockItemMaskedDto,
} from "./mappers";
import {
  canvaSchema,
  getDemoInventoryDetail,
  getDemoInventoryProduct,
  getDemoInventorySchema,
  stockItems,
  stockProducts,
} from "./mock";

type ListEnvelope = z.infer<typeof inventoryProductSummaryListEnvelopeSchema>;
type DetailEnvelope = z.infer<typeof inventoryProductDetailEnvelopeSchema>;
type SchemaEnvelope = z.infer<typeof inventorySchemaEnvelopeSchema>;
type ImportEnvelope = z.infer<typeof inventoryImportEnvelopeSchema>;
type RevealEnvelope = z.infer<typeof inventoryRevealEnvelopeSchema>;
type StockItemEnvelope = z.infer<typeof inventoryStockItemEnvelopeSchema>;

function isResourceNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const classified = classifyApiError(error.status, error.problem, {
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return classified.kind === "resource_not_found";
}

/**
 * Local editor seed for inventory detail chrome.
 * Mock mode only; API/disabled return empty until schema/items load.
 * Screens must not import ./mock directly (INT-170).
 */
export function getInventoryDetailLocalSeed(): {
  fields: InventorySchemaView["fields"];
  stockItems: StockItem[];
} {
  if (getDomainSource("sellerCatalog") !== "mock") {
    return { fields: [], stockItems: [] };
  }
  return {
    fields: [...canvaSchema],
    stockItems: [...stockItems] as StockItem[],
  };
}

/**
 * Store-scoped inventory product list (BoundedNoPaging).
 * Secrets never present on wire summary or mapped view.
 */
export async function listSellerInventory(
  storeId: string,
  signal?: AbortSignal,
): Promise<InventoryProduct[]> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return stockProducts.map((p) => ({ ...p }));
  }

  const response = await apiRequest<ListEnvelope>(
    `/v1/stores/${encodeURIComponent(storeId)}/inventory/products`,
    {
      schema: inventoryProductSummaryListEnvelopeSchema,
      signal,
    },
  );
  const mapped = (response.data || [])
    .slice(0, SELLER_INVENTORY_LIST_LIMIT)
    .map((row) => mapInventoryProductSummaryDto(row));
  for (const p of mapped) assertNoSecretsInInventoryProduct(p);
  return mapped;
}

/**
 * Product inventory summary + masked stock items.
 * Foreign/missing product → null (safe 404).
 */
export async function getSellerInventoryProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<InventoryProduct | null> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return getDemoInventoryProduct(productId);
  }

  try {
    const response = await apiRequest<DetailEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/inventory/products/${encodeURIComponent(productId)}`,
      {
        schema: inventoryProductDetailEnvelopeSchema,
        signal,
      },
    );
    const product = mapInventoryProductSummaryDto(response.data.summary);
    assertNoSecretsInInventoryProduct(product);
    return product;
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

/**
 * Detail bundle: product + masked items (for StockItemsTab).
 * Never secrets.
 */
export async function getSellerInventoryDetail(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<InventoryProductDetail | null> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return getDemoInventoryDetail(productId);
  }

  try {
    const response = await apiRequest<DetailEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/inventory/products/${encodeURIComponent(productId)}`,
      {
        schema: inventoryProductDetailEnvelopeSchema,
        signal,
      },
    );
    const product = mapInventoryProductSummaryDto(response.data.summary);
    const items = (response.data.items || []).map(
      mapInventoryStockItemMaskedDto,
    );
    assertNoSecretsInInventoryProduct(product);
    assertNoSecretsInStockItems(items);
    return { product, items };
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

export async function getSellerInventorySchema(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<InventorySchemaView | null> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return getDemoInventorySchema(productId);
  }

  try {
    const response = await apiRequest<SchemaEnvelope>(
      `/v1/stores/${encodeURIComponent(storeId)}/inventory/products/${encodeURIComponent(productId)}/schema`,
      {
        schema: inventorySchemaEnvelopeSchema,
        signal,
      },
    );
    return mapInventorySchemaDto(response.data);
  } catch (error) {
    if (isResourceNotFound(error)) return null;
    throw error;
  }
}

export async function putSellerInventorySchema(
  input: PutInventorySchemaInput,
  signal?: AbortSignal,
): Promise<InventorySchemaView> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return {
      id: `schema_${input.productId}`,
      productId: input.productId,
      storeId: input.storeId,
      version: (input.expectedVersion ?? 0) + 1,
      fields: input.fields,
      delimiter: input.delimiter || "|",
      checksum: "mock",
      createdAt: new Date().toISOString(),
    };
  }

  const ifMatch =
    input.ifMatch ||
    (input.expectedVersion != null ? String(input.expectedVersion) : undefined);

  const response = await apiRequest<SchemaEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/inventory/products/${encodeURIComponent(input.productId)}/schema`,
    {
      schema: inventorySchemaEnvelopeSchema,
      method: "PUT",
      body: {
        expectedVersion: input.expectedVersion ?? null,
        delimiter: input.delimiter || "|",
        fields: fieldsToPutBody(input.fields),
      },
      ifMatch,
      signal,
    },
  );
  return mapInventorySchemaDto(response.data);
}

export async function importSellerInventoryItems(
  input: ImportInventoryItemsInput,
  signal?: AbortSignal,
): Promise<InventoryImportResult> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    return {
      imported: input.items.length,
      itemIds: input.items.map((_, i) => `stk_mock_${i + 1}`),
    };
  }

  const response = await apiRequest<ImportEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/inventory/products/${encodeURIComponent(input.productId)}/items`,
    {
      schema: inventoryImportEnvelopeSchema,
      method: "POST",
      body: {
        expectedSchemaVersion: input.expectedSchemaVersion,
        items: input.items,
      },
      idempotencyKey: input.idempotencyKey || createIdempotencyKey(),
      signal,
    },
  );
  return {
    imported: response.data.imported,
    itemIds: response.data.itemIds,
  };
}

/**
 * Per-item reveal. requireRecentMfa attaches X-Recent-MFA-Proof (INT-140).
 * Result is component-local only — never put in React Query cache.
 */
export async function revealSellerInventoryItem(
  input: RevealInventoryItemInput,
  signal?: AbortSignal,
): Promise<InventoryRevealResult> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    const demo = stockItems.find((i) => i.id === input.itemId);
    return {
      itemId: input.itemId,
      productId: "prod_account",
      schemaVersion: 1,
      status: "AVAILABLE",
      secrets: demo?.values ?? { password: "mock-secret" },
      masked: {},
      auditId: "audit_mock",
    };
  }

  const response = await apiRequest<RevealEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/inventory/items/${encodeURIComponent(input.itemId)}/reveal`,
    {
      schema: inventoryRevealEnvelopeSchema,
      method: "POST",
      body: { reason: input.reason },
      requireRecentMfa: true,
      recentMfaProof: input.recentMfaProof,
      signal,
    },
  );
  return {
    itemId: response.data.itemId,
    productId: response.data.productId,
    schemaVersion: response.data.schemaVersion,
    status: response.data.status,
    secrets: response.data.secrets,
    masked: response.data.masked,
    auditId: response.data.auditId,
  };
}

export async function revokeSellerInventoryItem(
  input: RevokeInventoryItemInput,
  signal?: AbortSignal,
): Promise<StockItem> {
  if (shouldUseMockFixtures("sellerCatalog")) {
    const demo = stockItems.find((i) => i.id === input.itemId);
    return {
      id: input.itemId,
      values: demo?.values ?? {},
      status: "Invalid",
      createdAt: demo?.createdAt ?? "—",
    };
  }

  const response = await apiRequest<StockItemEnvelope>(
    `/v1/stores/${encodeURIComponent(input.storeId)}/inventory/items/${encodeURIComponent(input.itemId)}/revoke`,
    {
      schema: inventoryStockItemEnvelopeSchema,
      method: "POST",
      body: input.reason ? { reason: input.reason } : {},
      signal,
    },
  );
  const item = mapInventoryStockItemMaskedDto(response.data);
  assertNoSecretsInStockItems([item]);
  return item;
}
