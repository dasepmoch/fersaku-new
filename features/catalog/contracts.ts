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
  allowPayWhatYouWant?: boolean;
  minimumPrice?: number;
  updatesEnabled?: boolean;
  currentVersion?: string;
};

export type PublicStorefront = {
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
