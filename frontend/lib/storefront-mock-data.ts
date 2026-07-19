import { products as asepProducts, type Product } from "./mock-data";

export type StorefrontConfig = {
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
  products: Product[];
};

const designProducts: Product[] = [
  {
    id: "dsg_01",
    slug: "brand-system-canvas",
    title: "Brand System Canvas",
    short: "Sistem Figma untuk merancang identitas brand yang konsisten.",
    description:
      "Workspace strategis dari positioning sampai design token, dibuat untuk studio dan founder yang ingin bergerak cepat tanpa kehilangan rasa.",
    price: 229000,
    type: "link",
    badge: "Studio pick",
    sales: 168,
    palette: "#ff7a59",
    glyph: "Aa",
    includes: [
      "Figma workspace",
      "Brand strategy canvas",
      "48 layout templates",
      "Commercial license",
    ],
    updatesEnabled: true,
    currentVersion: "v2.4",
  },
  {
    id: "dsg_02",
    slug: "social-launch-deck",
    title: "Social Launch Deck",
    short: "120 template kampanye untuk peluncuran yang terasa satu napas.",
    description:
      "Template modular untuk Instagram, LinkedIn, dan campaign deck dengan sistem warna dan tipografi yang mudah disesuaikan.",
    price: 149000,
    type: "download",
    sales: 294,
    palette: "#ffd75a",
    glyph: "↗",
    includes: [
      "120 social templates",
      "3 campaign directions",
      "Canva + Figma",
      "Lifetime access",
    ],
  },
  {
    id: "dsg_03",
    slug: "editorial-web-kit",
    title: "Editorial Web Kit",
    short: "Komponen web ekspresif untuk portfolio dan creative commerce.",
    description:
      "Koleksi section editorial dengan ritme tipografi kuat, layout responsif, dan komponen conversion-ready.",
    price: 319000,
    type: "download",
    badge: "New release",
    sales: 81,
    palette: "#98e6c5",
    glyph: "E",
    includes: [
      "220 responsive sections",
      "Variable type scale",
      "Framer examples",
      "Agency license",
    ],
  },
];

export const storefronts: Record<string, StorefrontConfig> = {
  "asep-ai-tools": {
    slug: "asep-ai-tools",
    name: "Asep AI Tools",
    monogram: "A",
    bio: "Tools, template, dan workflow praktis untuk membantumu bekerja lebih cerdas dengan AI.",
    tagline: "Kerja lebih singkat. Hasil lebih tajam.",
    verified: true,
    accent: "#d7ff64",
    ink: "#173f2c",
    canvas: "#f4f2eb",
    preset: "atelier",
    layout: "grid",
    font: "editorial",
    hero: "statement",
    cards: "soft",
    texture: "noise",
    radius: "round",
    headerAlign: "left",
    announcement: "Gratis pembaruan AI Prompt Pack v3 untuk semua pembeli lama",
    featuredProductIds: ["prod_01", "prod_03"],
    sections: ["products", "reviews", "trust", "about"],
    socials: { instagram: "asep.ai", website: "asep.ai" },
    trustBadges: [
      "Pembayaran QRIS aman",
      "Akses instan",
      "428+ kreator terbantu",
    ],
    rating: 4.9,
    reviewCount: 186,
    products: asepProducts,
  },
  "designkit-studio": {
    slug: "designkit-studio",
    name: "DesignKit Studio",
    monogram: "D",
    bio: "Design systems, launch kits, dan creative assets untuk tim yang peduli pada detail.",
    tagline: "Make the useful unforgettable.",
    verified: true,
    accent: "#ff7a59",
    ink: "#1d2433",
    canvas: "#f7f1e8",
    preset: "paper",
    layout: "editorial",
    font: "modern",
    hero: "split",
    cards: "poster",
    texture: "grid",
    radius: "soft",
    headerAlign: "center",
    announcement: "Summer studio drop — 3 kit baru sudah tersedia",
    featuredProductIds: ["dsg_01"],
    sections: ["products", "about", "reviews", "trust"],
    socials: {
      instagram: "designkit.studio",
      website: "designkit.studio",
      youtube: "DesignKit",
    },
    trustBadges: [
      "Lisensi komersial",
      "Dipakai 40+ studio",
      "File selalu diperbarui",
    ],
    rating: 4.8,
    reviewCount: 92,
    products: designProducts,
  },
};

export function getStorefront(slug: string) {
  return storefronts[slug];
}

export function findProduct(productIdOrSlug: string) {
  for (const store of Object.values(storefronts)) {
    const product = store.products.find(
      (item) => item.id === productIdOrSlug || item.slug === productIdOrSlug,
    );
    if (product) return { store, product };
  }
  return undefined;
}
