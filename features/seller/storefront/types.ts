export type Layout = "grid" | "editorial" | "catalog" | "minimal";
export type Hero = "statement" | "split" | "compact" | "spotlight";
export type CardStyle = "soft" | "outline" | "poster" | "compact";
export type Texture = "noise" | "grid" | "dots" | "clean";
export type Radius = "round" | "soft" | "sharp";
export type FontStyle = "editorial" | "modern" | "friendly" | "mono";
export type BuilderTab =
  "Templates" | "Brand" | "Layout" | "Sections" | "Links & SEO";

export type BuilderConfig = {
  template: string;
  name: string;
  tagline: string;
  bio: string;
  announcement: string;
  announcementEnabled: boolean;
  accent: string;
  ink: string;
  canvas: string;
  layout: Layout;
  hero: Hero;
  cards: CardStyle;
  texture: Texture;
  radius: Radius;
  font: FontStyle;
  align: "left" | "center";
  density: "comfortable" | "compact";
  showSearch: boolean;
  showSales: boolean;
  showRatings: boolean;
  featuredIds: string[];
  sections: Array<{ id: string; label: string; visible: boolean }>;
  trustBadges: string[];
  instagram: string;
  website: string;
  customLinks: Array<{ label: string; url: string }>;
  seoTitle: string;
  seoDescription: string;
};

export type StorefrontTemplate = {
  name: string;
  note: string;
  colors: string[];
  config: Partial<BuilderConfig>;
};
