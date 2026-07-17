export type ProductType = "download" | "link" | "code";

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
  /** Canonical owning store slug for public featured/product links (PUB-100). */
  storeSlug?: string;
  /** Owning store id for checkout quote (CHK-100); not a secret. */
  storeId?: string;
  allowPayWhatYouWant?: boolean;
  minimumPrice?: number;
  updatesEnabled?: boolean;
  currentVersion?: string;
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
