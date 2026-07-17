export type ProductType = "download" | "link" | "code";

/** Seller lifecycle (wire + view). Public projections omit status. */
export type ProductStatus = "draft" | "published" | "archived";

/**
 * Visual delivery option on product form (not a catalog type enum).
 * `credentials` maps to wire type `code` + delivery kind CREDENTIAL (SEL-220).
 */
export type ProductDeliveryOption =
  | "download"
  | "link"
  | "code"
  | "credentials";

/** Inventory/delivery kind after catalog type freeze (SEL-220 / SEL-240). */
export type ProductDeliveryKind = "DOWNLOAD" | "LINK" | "CODE" | "CREDENTIAL";

/**
 * SEL-210 — product list filters (BoundedNoPaging).
 * BE list has no search/status query yet; adapter maps filters client-side
 * over the store-scoped response and caps at SELLER_PRODUCT_LIST_LIMIT.
 */
export type SellerProductListFilters = {
  q?: string;
  status?: ProductStatus | "all";
  type?: ProductType | "all";
};

/** Launch bound; list UI has no TablePagination (UI-080 for expansion). */
export const SELLER_PRODUCT_LIST_LIMIT = 50;

/** Form field keys that map to existing product editor regions. */
export type ProductFormField =
  | "title"
  | "slug"
  | "description"
  | "price"
  | "type"
  | "short"
  | "generic";

export type ProductFieldError = {
  field: ProductFormField;
  message: string;
};

/** SEL-220 create command (view → wire). */
export type CreateSellerProductInput = {
  storeId: string;
  title: string;
  slug?: string;
  short?: string;
  description?: string;
  /** Whole IDR. */
  price: number;
  /**
   * Visual delivery option. Never send `credentials` on the wire —
   * map via mapDeliveryOptionToWireType.
   */
  delivery: ProductDeliveryOption;
  badge?: string;
  palette?: string;
  glyph?: string;
  includes?: string[];
  allowPayWhatYouWant?: boolean;
  minimumPrice?: number;
  currentVersion?: string;
  idempotencyKey?: string;
};

/** SEL-220 patch command (partial; status via publish/archive only). */
export type PatchSellerProductInput = {
  storeId: string;
  productId: string;
  slug?: string;
  title?: string;
  short?: string;
  description?: string;
  price?: number;
  delivery?: ProductDeliveryOption;
  badge?: string;
  palette?: string;
  glyph?: string;
  includes?: string[];
  allowPayWhatYouWant?: boolean;
  minimumPrice?: number;
  minimumPriceCleared?: boolean;
  currentVersion?: string;
  /** If-Match / revision when contract supplies it. */
  ifMatch?: string;
};

export type ArchiveSellerProductInput = {
  storeId: string;
  productId: string;
  idempotencyKey?: string;
  reason?: string;
};

export type PublishSellerProductInput = {
  storeId: string;
  productId: string;
  idempotencyKey?: string;
  reason?: string;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  title: string;
  short: string;
  description: string;
  price: number;
  type: ProductType;
  badge?: string;
  sales: number;
  palette: string;
  glyph: string;
  includes: string[];
  /** Seller-only lifecycle; public DTOs omit. */
  status?: ProductStatus;
  /** Canonical owning store slug for public featured/product links (PUB-100). */
  storeSlug?: string;
  /** Owning store id for checkout quote (CHK-100); not a secret. */
  storeId?: string;
  allowPayWhatYouWant?: boolean;
  minimumPrice?: number;
  updatesEnabled?: boolean;
  currentVersion?: string;
};

export type PublishSellerProductResult = {
  accepted: boolean;
  productId: string;
  requestId: string;
  product?: CatalogProduct;
};

/** Featured homepage card — storeSlug is required for tenant-correct URLs. */
export type FeaturedCatalogProduct = CatalogProduct & {
  storeSlug: string;
};

export type PublicProductMatch = {
  product: CatalogProduct;
  storeSlug: string;
};

export type PublicStorefront = {
  /** Store id when known (checkout quote); optional on mock/legacy. */
  storeId?: string;
  slug: string;
  name: string;
  monogram: string;
  bio: string;
  tagline: string;
  verified: boolean;
  accent: string;
  ink: string;
  canvas: string;
  preset: "atelier" | "signal" | "paper" | "catalog";
  layout: "grid" | "editorial" | "minimal" | "catalog";
  font: "editorial" | "modern" | "friendly";
  hero: "statement" | "split" | "compact";
  cards: "soft" | "outline" | "poster";
  texture: "noise" | "grid" | "dots" | "none";
  radius: "soft" | "round" | "sharp";
  headerAlign: "left" | "center";
  announcement?: string;
  featuredProductIds: string[];
  sections: Array<"products" | "reviews" | "trust" | "about">;
  socials: { instagram?: string; website?: string; youtube?: string };
  trustBadges: string[];
  rating: number;
  reviewCount: number;
  products: CatalogProduct[];
};
