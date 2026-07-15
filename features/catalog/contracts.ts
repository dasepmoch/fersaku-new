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
