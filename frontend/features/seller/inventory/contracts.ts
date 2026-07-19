/**
 * Inventory view-model contracts (types only).
 * Fixture values live in mock adapters — not presentation authority.
 * SEL-240: decoupled from typeof stockProducts.
 */

export type InventoryField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  buyerCopyable: boolean;
};

/** UI status labels used by existing Status chrome. */
export type StockItemStatusLabel =
  "Available" | "Reserved" | "Sold" | "Invalid";

export type StockItem = {
  id: string;
  values: Record<string, string>;
  status: StockItemStatusLabel;
  orderId?: string;
  createdAt: string;
};

/** Existing inventory product card / detail chrome (list + detail). */
export type InventoryProduct = {
  id: string;
  title: string;
  type: string;
  available: number;
  reserved: number;
  sold: number;
  invalid: number;
  lowAt: number;
  delivery: string;
  /** Active schema version when known (API); omitted in pure mock chrome. */
  activeSchemaVersion?: number | null;
  storeId?: string;
  total?: number;
};

export type InventorySchemaView = {
  id: string;
  productId: string;
  storeId: string;
  version: number;
  fields: InventoryField[];
  delimiter: string;
  checksum: string;
  createdAt: string;
};

export type InventoryProductDetail = {
  product: InventoryProduct;
  items: StockItem[];
};

export type InventoryImportResult = {
  imported: number;
  itemIds: string[];
};

/**
 * Reveal payload is component-local only — never React Query / storage / log.
 * TTL cleanup is caller responsibility.
 */
export type InventoryRevealResult = {
  itemId: string;
  productId: string;
  schemaVersion?: number;
  status?: string;
  secrets: Record<string, string>;
  masked?: Record<string, string>;
  auditId: string;
};

export type PutInventorySchemaInput = {
  storeId: string;
  productId: string;
  fields: InventoryField[];
  delimiter?: string;
  expectedVersion?: number | null;
  ifMatch?: string;
};

export type ImportInventoryItemsInput = {
  storeId: string;
  productId: string;
  expectedSchemaVersion: number;
  items: Record<string, string>[];
  idempotencyKey?: string;
};

export type RevealInventoryItemInput = {
  storeId: string;
  itemId: string;
  reason: string;
  /** Optional explicit proof; otherwise requireRecentMfa attaches memory proof. */
  recentMfaProof?: string;
};

export type RevokeInventoryItemInput = {
  storeId: string;
  itemId: string;
  reason?: string;
};

/** Launch bound for inventory product list (BoundedNoPaging). */
export const SELLER_INVENTORY_LIST_LIMIT = 50;

/** Default low-stock threshold when BE has no threshold field (UI residual). */
export const DEFAULT_INVENTORY_LOW_AT = 20;
