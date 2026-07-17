export type BuyerPurchaseDeliveryType =
  | "download"
  | "link"
  | "credentials"
  | "code";

/**
 * Buyer purchase view model (existing UI geometry).
 * Base list/detail from API carries redacted delivery metadata only —
 * raw secrets come from CHK-140 delivery access, never list/detail base.
 */
export type BuyerPurchase = {
  /** Display / route id (order number when available). */
  orderId: string;
  /** Backend order ULID when distinct from display orderId. */
  internalOrderId?: string;
  productId: string;
  product: string;
  seller: string;
  sellerSlug: string;
  price: number;
  purchasedAt: string;
  status: "Paid" | "Pending";
  deliveryType: BuyerPurchaseDeliveryType;
  palette: string;
  glyph: string;
  version?: string;
  updateAvailable?: string;
  sellerUpdatesEnabled: boolean;
  /** Redacted download metadata — no signed URL / object key. */
  downloads?: {
    used: number;
    max: number;
    expiresAt: string;
    fileName: string;
    fileSize: string;
  };
  /** Redacted protected-link metadata — no live URL. */
  protectedLink?: { label: string; host: string; lastOpened?: string };
  /**
   * Credential fields. List path must leave empty/absent.
   * Detail base from BUY-100 is empty; values only after CHK-140 access.
   */
  credentialFields?: Array<{ label: string; value: string; secret?: boolean }>;
  /**
   * Product code shell. List path must not set value.
   * Detail base from BUY-100 uses empty value until delivery access.
   */
  code?: {
    value: string;
    status: "Assigned" | "Revealed" | "Activated";
    instructions: string;
  };
};

export type BuyerSession = {
  id: string;
  device: string;
  location: string;
  ip: string;
  active: string;
  current: boolean;
};

export type BuyerProfile = {
  name: string;
  email: string;
  phone: string;
  locale: string;
  timezone: string;
};

/** Filters accepted by purchase list query (existing UI controls). */
export type BuyerPurchaseListFilters = {
  q?: string;
  filter?: "Semua" | "File" | "Akses & kode" | "Update tersedia";
};
