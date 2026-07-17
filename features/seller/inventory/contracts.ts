/**
 * Inventory view-model contracts (types only).
 * Fixture values live in mock adapters / lib fixtures — not presentation authority.
 */

export type InventoryField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  buyerCopyable: boolean;
};

export type StockItem = {
  id: string;
  values: Record<string, string>;
  status: "Available" | "Reserved" | "Sold" | "Invalid";
  orderId?: string;
  createdAt: string;
};
