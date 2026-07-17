/**
 * Catalog transport DTO → existing view model (UI-040 / INT-010).
 * Pure; no React. Screens continue to use features/catalog/contracts.ts.
 * Authority: TASK/evidence/UI-040/dto-view-parity.md
 */

import type { CatalogProductDto, PublicStorefrontDto } from "@/shared/api/schemas";
import {
  invalidApiContract,
  mapExhaustiveEnum,
  requireSafeMoneyIdr,
} from "@/shared/api/mappers";
import type { CatalogProduct, ProductType, PublicStorefront } from "./contracts";

const PRODUCT_TYPE_MAP = {
  download: "download",
  link: "link",
  code: "code",
} as const satisfies Record<string, ProductType>;

const PRESET = {
  atelier: "atelier",
  signal: "signal",
  paper: "paper",
  catalog: "catalog",
} as const satisfies Record<string, PublicStorefront["preset"]>;

const LAYOUT = {
  grid: "grid",
  editorial: "editorial",
  minimal: "minimal",
  catalog: "catalog",
} as const satisfies Record<string, PublicStorefront["layout"]>;

const FONT = {
  editorial: "editorial",
  modern: "modern",
  friendly: "friendly",
} as const satisfies Record<string, PublicStorefront["font"]>;

const HERO = {
  statement: "statement",
  split: "split",
  compact: "compact",
} as const satisfies Record<string, PublicStorefront["hero"]>;

const CARDS = {
  soft: "soft",
  outline: "outline",
  poster: "poster",
} as const satisfies Record<string, PublicStorefront["cards"]>;

const TEXTURE = {
  noise: "noise",
  grid: "grid",
  dots: "dots",
  none: "none",
} as const satisfies Record<string, PublicStorefront["texture"]>;

const RADIUS = {
  soft: "soft",
  round: "round",
  sharp: "sharp",
} as const satisfies Record<string, PublicStorefront["radius"]>;

const HEADER_ALIGN = {
  left: "left",
  center: "center",
} as const satisfies Record<string, PublicStorefront["headerAlign"]>;

const SECTION = {
  products: "products",
  reviews: "reviews",
  trust: "trust",
  about: "about",
} as const satisfies Record<
  string,
  PublicStorefront["sections"][number]
>;

function mapProductType(value: string): ProductType {
  return mapExhaustiveEnum(
    value as keyof typeof PRODUCT_TYPE_MAP,
    PRODUCT_TYPE_MAP,
    "product.type",
  );
}

function mapOptionalEnum<TTable extends Record<string, string>>(
  value: string | undefined,
  table: TTable,
  label: string,
  fallback: TTable[keyof TTable],
): TTable[keyof TTable] {
  if (value === undefined || value === "") return fallback;
  if (Object.prototype.hasOwnProperty.call(table, value)) {
    return table[value as keyof TTable];
  }
  return invalidApiContract(`Unknown ${label}: ${value}`, {
    issues: [{ path: label, message: "unsupported enum value" }],
  });
}

/** Map wire CatalogProduct DTO to frozen CatalogProduct view model. */
export function mapCatalogProductDto(dto: CatalogProductDto): CatalogProduct {
  const price = requireSafeMoneyIdr(dto.price, "price");
  const view: CatalogProduct = {
    id: dto.id,
    slug: dto.slug,
    title: dto.title,
    short: dto.short,
    description: dto.description,
    price,
    type: mapProductType(dto.type),
    sales: dto.sales,
    palette: dto.palette,
    glyph: dto.glyph,
    includes: [...dto.includes],
  };
  if (dto.badge !== undefined) view.badge = dto.badge;
  if (dto.allowPayWhatYouWant !== undefined) {
    view.allowPayWhatYouWant = dto.allowPayWhatYouWant;
  }
  if (dto.minimumPrice !== undefined) {
    view.minimumPrice = requireSafeMoneyIdr(dto.minimumPrice, "minimumPrice");
  }
  if (dto.updatesEnabled !== undefined) view.updatesEnabled = dto.updatesEnabled;
  if (dto.currentVersion !== undefined) view.currentVersion = dto.currentVersion;
  return view;
}

export function mapCatalogProductListDto(
  items: CatalogProductDto[],
): CatalogProduct[] {
  return items.map(mapCatalogProductDto);
}

/** Map wire PublicStorefront DTO to frozen PublicStorefront view model. */
export function mapPublicStorefrontDto(
  dto: PublicStorefrontDto,
): PublicStorefront {
  const sections = (dto.sections ?? []).map((section) =>
    mapOptionalEnum(section, SECTION, "storefront.sections", "products"),
  );

  const socialsRaw = dto.socials ?? {};
  const socials: PublicStorefront["socials"] = {};
  if (typeof socialsRaw.instagram === "string") {
    socials.instagram = socialsRaw.instagram;
  }
  if (typeof socialsRaw.website === "string") {
    socials.website = socialsRaw.website;
  }
  if (typeof socialsRaw.youtube === "string") {
    socials.youtube = socialsRaw.youtube;
  }

  return {
    slug: dto.slug,
    name: dto.name,
    monogram: dto.monogram,
    bio: dto.bio,
    tagline: dto.tagline ?? "",
    verified: dto.verified ?? false,
    accent: dto.accent ?? "",
    ink: dto.ink ?? "",
    canvas: dto.canvas ?? "",
    preset: mapOptionalEnum(dto.preset, PRESET, "storefront.preset", "atelier"),
    layout: mapOptionalEnum(dto.layout, LAYOUT, "storefront.layout", "grid"),
    font: mapOptionalEnum(dto.font, FONT, "storefront.font", "modern"),
    hero: mapOptionalEnum(dto.hero, HERO, "storefront.hero", "statement"),
    cards: mapOptionalEnum(dto.cards, CARDS, "storefront.cards", "soft"),
    texture: mapOptionalEnum(dto.texture, TEXTURE, "storefront.texture", "none"),
    radius: mapOptionalEnum(dto.radius, RADIUS, "storefront.radius", "soft"),
    headerAlign: mapOptionalEnum(
      dto.headerAlign,
      HEADER_ALIGN,
      "storefront.headerAlign",
      "left",
    ),
    announcement: dto.announcement,
    featuredProductIds: dto.featuredProductIds ? [...dto.featuredProductIds] : [],
    sections,
    socials,
    trustBadges: dto.trustBadges ? [...dto.trustBadges] : [],
    rating: dto.rating ?? 0,
    reviewCount: dto.reviewCount ?? 0,
    products: mapCatalogProductListDto(dto.products),
  };
}
