/**
 * Catalog transport DTO → existing view model (UI-040 / INT-010).
 * Pure; no React. Screens continue to use features/catalog/contracts.ts.
 * Authority: TASK/evidence/UI-040/dto-view-parity.md
 */

import type {
  CatalogProductDto,
  FeaturedCatalogProductDto,
  PublicStorefrontDto,
} from "@/shared/api/schemas";
import {
  invalidApiContract,
  mapExhaustiveEnum,
  requireSafeMoneyIdr,
} from "@/shared/api/mappers";
import { ApiError } from "@/shared/api/api-error";
import { classifyApiError, classifyThrown } from "@/shared/api/error-policy";
import { PROBLEM_CODES } from "@/shared/api/problem-codes";
import type {
  CatalogProduct,
  CreateSellerProductInput,
  FeaturedCatalogProduct,
  PatchSellerProductInput,
  ProductDeliveryKind,
  ProductDeliveryOption,
  ProductFieldError,
  ProductFormField,
  ProductStatus,
  ProductType,
  PublicProductMatch,
  PublicStorefront,
  SellerProductListFilters,
} from "./contracts";
import { SELLER_PRODUCT_LIST_LIMIT } from "./contracts";

const PRODUCT_TYPE_MAP = {
  download: "download",
  link: "link",
  code: "code",
} as const satisfies Record<string, ProductType>;

const PRODUCT_STATUS_MAP = {
  draft: "draft",
  published: "published",
  archived: "archived",
} as const satisfies Record<string, ProductStatus>;

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
} as const satisfies Record<string, PublicStorefront["sections"][number]>;

function mapProductType(value: string): ProductType {
  return mapExhaustiveEnum(
    value as keyof typeof PRODUCT_TYPE_MAP,
    PRODUCT_TYPE_MAP,
    "product.type",
  );
}

/** Exhaustive status map; unknown never becomes published/live. */
export function mapProductStatus(value: string): ProductStatus {
  return mapExhaustiveEnum(
    value as keyof typeof PRODUCT_STATUS_MAP,
    PRODUCT_STATUS_MAP,
    "product.status",
  );
}

/**
 * SEL-220 — freeze delivery-type mapping.
 * Visual `credentials` is NOT a catalog product type; maps to wire type `code`
 * plus structured inventory delivery kind CREDENTIAL.
 * Visual `code` → type `code` + CODE delivery.
 */
export function mapDeliveryOptionToWireType(
  delivery: ProductDeliveryOption,
): ProductType {
  if (delivery === "credentials" || delivery === "code") return "code";
  if (delivery === "download") return "download";
  if (delivery === "link") return "link";
  return invalidApiContract(`Unknown product delivery option: ${delivery}`, {
    issues: [{ path: "type", message: "unsupported delivery option" }],
  });
}

export function mapDeliveryOptionToDeliveryKind(
  delivery: ProductDeliveryOption,
): ProductDeliveryKind {
  if (delivery === "credentials") return "CREDENTIAL";
  if (delivery === "code") return "CODE";
  if (delivery === "download") return "DOWNLOAD";
  if (delivery === "link") return "LINK";
  return invalidApiContract(`Unknown product delivery option: ${delivery}`, {
    issues: [{ path: "type", message: "unsupported delivery option" }],
  });
}

/** Normalize product slug for create/patch (mirrors BE NormalizeProductSlug). */
export function normalizeProductSlug(raw: string | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
    } else if (ch === "-" || ch === "_" || ch === " ") {
      out += "-";
    } else if (code > 127) {
      continue;
    } else {
      out += "-";
    }
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

/** Parse whole-IDR price from form text (dots/commas as thousand separators). */
export function parseProductPriceIdr(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/** Glyph default from title (first 2 alphanumerics upper). */
export function defaultProductGlyph(title: string): string {
  const letters = title
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return letters || "PR";
}

const PRODUCT_FIELD_ALIASES: Record<string, ProductFormField> = {
  title: "title",
  name: "title",
  slug: "slug",
  description: "description",
  short: "short",
  price: "price",
  type: "type",
  delivery: "type",
};

function mapProductFieldName(raw: string): ProductFormField | null {
  const key = raw.trim();
  if (!key) return null;
  const leaf = key.includes(".") ? (key.split(".").pop() ?? key) : key;
  return (
    PRODUCT_FIELD_ALIASES[leaf] ??
    PRODUCT_FIELD_ALIASES[leaf.toLowerCase()] ??
    null
  );
}

function defaultProductFieldMessage(
  field: ProductFormField,
  code: string,
): string {
  if (field === "title") return "Nama produk tidak valid.";
  if (field === "slug") return "Slug produk tidak valid.";
  if (field === "price") return "Harga harus bilangan bulat Rupiah.";
  if (field === "type") return "Jenis pengiriman tidak valid.";
  if (field === "description") return "Deskripsi tidak valid.";
  if (code) return "Periksa kembali field ini.";
  return "Periksa kembali field ini.";
}

export function mapFieldViolationsToProductFields(
  violations: Array<{ field: string; code: string; message?: string }>,
): ProductFieldError[] {
  const out: ProductFieldError[] = [];
  const seen = new Set<ProductFormField>();
  for (const v of violations) {
    const field = mapProductFieldName(v.field) ?? "generic";
    if (seen.has(field)) continue;
    seen.add(field);
    out.push({
      field,
      message: v.message?.trim() || defaultProductFieldMessage(field, v.code),
    });
  }
  return out;
}

/**
 * Map thrown product command errors onto existing form field regions.
 * 409 slug conflict → slug; validation → field violations; preserve draft on conflict.
 */
export function mapProductCommandThrown(
  error: unknown,
):
  | { kind: "field_errors"; fields: ProductFieldError[] }
  | { kind: "conflict"; message: string }
  | { kind: "generic"; message: string; code: string | null } {
  if (error instanceof ApiError) {
    const classified = classifyApiError(error.status, error.problem, {
      retryAfterSeconds: error.retryAfterSeconds,
    });
    const code = error.code;

    if (error.status === 409 || code === PROBLEM_CODES.CONFLICT) {
      return {
        kind: "field_errors",
        fields: [
          {
            field: "slug",
            message: "Slug produk sudah digunakan di toko ini.",
          },
        ],
      };
    }

    if (
      code === PROBLEM_CODES.VALIDATION_FAILED ||
      classified.kind === "form_field_violations"
    ) {
      const fields = mapFieldViolationsToProductFields(
        classified.fieldViolations,
      );
      if (fields.length > 0) {
        return { kind: "field_errors", fields };
      }
      return {
        kind: "field_errors",
        fields: [
          {
            field: "generic",
            message: error.message || "Periksa kembali data produk.",
          },
        ],
      };
    }

    if (classified.kind === "conflict_preserve_draft") {
      return {
        kind: "conflict",
        message:
          error.message ||
          "Produk berubah di tab lain. Muat ulang untuk menyimpan ulang.",
      };
    }

    return {
      kind: "generic",
      message: error.message || "Gagal menyimpan produk.",
      code,
    };
  }

  const thrown = classifyThrown(error);
  return {
    kind: "generic",
    message: thrown.message || "Gagal menyimpan produk.",
    code: thrown.code || null,
  };
}

/** Build CreateProductRequest body (wire). Never includes credentials as type. */
export function toCreateProductRequestBody(
  input: CreateSellerProductInput,
): Record<string, unknown> {
  const type = mapDeliveryOptionToWireType(input.delivery);
  const slug = normalizeProductSlug(input.slug);
  const body: Record<string, unknown> = {
    title: input.title.trim(),
    price: input.price,
    type,
  };
  if (slug) body.slug = slug;
  if (input.short !== undefined) body.short = input.short;
  if (input.description !== undefined) body.description = input.description;
  if (input.badge !== undefined) body.badge = input.badge;
  if (input.palette !== undefined) body.palette = input.palette;
  if (input.glyph !== undefined) body.glyph = input.glyph;
  if (input.includes !== undefined) body.includes = input.includes;
  if (input.allowPayWhatYouWant !== undefined) {
    body.allowPayWhatYouWant = input.allowPayWhatYouWant;
  }
  if (input.minimumPrice !== undefined) body.minimumPrice = input.minimumPrice;
  if (input.currentVersion !== undefined) {
    body.currentVersion = input.currentVersion;
  }
  return body;
}

/** Build PatchProductRequest body (wire). Status never included. */
export function toPatchProductRequestBody(
  input: PatchSellerProductInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.slug !== undefined) body.slug = normalizeProductSlug(input.slug);
  if (input.title !== undefined) body.title = input.title.trim();
  if (input.short !== undefined) body.short = input.short;
  if (input.description !== undefined) body.description = input.description;
  if (input.price !== undefined) body.price = input.price;
  if (input.delivery !== undefined) {
    body.type = mapDeliveryOptionToWireType(input.delivery);
  }
  if (input.badge !== undefined) body.badge = input.badge;
  if (input.palette !== undefined) body.palette = input.palette;
  if (input.glyph !== undefined) body.glyph = input.glyph;
  if (input.includes !== undefined) body.includes = input.includes;
  if (input.allowPayWhatYouWant !== undefined) {
    body.allowPayWhatYouWant = input.allowPayWhatYouWant;
  }
  if (input.minimumPriceCleared) {
    body.minimumPriceCleared = true;
  } else if (input.minimumPrice !== undefined) {
    body.minimumPrice = input.minimumPrice;
  }
  if (input.currentVersion !== undefined) {
    body.currentVersion = input.currentVersion;
  }
  return body;
}

/** Status label for detail Status chip (existing Active/Archived geometry). */
export function productDetailStatusLabel(
  status: ProductStatus | undefined,
  archivedLocal?: boolean,
): string {
  if (archivedLocal || status === "archived") return "Archived";
  if (status === "draft") return "Draft";
  return "Active";
}

/** Existing list chrome label; unknown status never reaches here. */
export function productStatusListLabel(
  status: ProductStatus | undefined,
): string {
  if (status === "draft") return "Draft";
  if (status === "archived") return "Archived";
  return "Published";
}

/** Normalize search for list filter (trim + collapse space + lower). */
export function normalizeProductSearch(q: string | undefined): string {
  return (q ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function productSearchHaystack(p: CatalogProduct): string {
  return `${p.title} ${p.slug} ${p.short}`.toLowerCase();
}

/**
 * PUB-210 — filter already-bounded published storefront products (tenant fixed).
 * Empty/whitespace query returns the input list unchanged.
 */
export function filterStorefrontProducts(
  products: CatalogProduct[],
  q: string | undefined,
): CatalogProduct[] {
  const normalized = normalizeProductSearch(q);
  if (!normalized) return products;
  return products.filter((p) => productSearchHaystack(p).includes(normalized));
}

/**
 * Apply search/status/type filters and hard bound (no local full-catalog paging).
 * Preserves input order (BE: created_at DESC, id DESC).
 */
export function applySellerProductListFilters(
  items: CatalogProduct[],
  filters?: SellerProductListFilters,
  limit: number = SELLER_PRODUCT_LIST_LIMIT,
): CatalogProduct[] {
  const q = normalizeProductSearch(filters?.q);
  const status = filters?.status ?? "all";
  const type = filters?.type ?? "all";
  const max = Math.max(0, Math.min(limit, SELLER_PRODUCT_LIST_LIMIT));

  const out: CatalogProduct[] = [];
  for (const p of items) {
    if (status !== "all" && p.status !== status) continue;
    if (type !== "all" && p.type !== type) continue;
    if (q) {
      if (!productSearchHaystack(p).includes(q)) continue;
    }
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** External link attrs for safe storefront socials (PUB-210). */
export const SAFE_EXTERNAL_LINK_REL = "noopener noreferrer" as const;
export const SAFE_EXTERNAL_LINK_TARGET = "_blank" as const;

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

function stripAtHandle(raw: string): string {
  return raw.replace(/^@+/, "").trim();
}

/**
 * Parse and allowlist a browser-navigable https URL only.
 * Rejects credentials, non-https schemes, and empty hosts.
 */
export function parseSafeHttpsUrl(raw: string | undefined): URL | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || url.hostname.includes(" ")) return null;
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    return null;
  }
  return url;
}

function hostAllowed(hostname: string, allow: Set<string>): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return allow.has(host);
}

/**
 * Instagram: full https URL on allowlisted hosts, or bare handle/path.
 * Missing/malicious → undefined (omit icon).
 */
export function mapSafeInstagramHref(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.includes("/")) {
    const url = parseSafeHttpsUrl(trimmed);
    if (!url || !hostAllowed(url.hostname, INSTAGRAM_HOSTS)) return undefined;
    return url.toString();
  }

  const handle = stripAtHandle(trimmed);
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return undefined;
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}

/**
 * YouTube: allowlisted hosts, or bare channel/handle token.
 */
export function mapSafeYoutubeHref(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.includes("/")) {
    const url = parseSafeHttpsUrl(trimmed);
    if (!url || !hostAllowed(url.hostname, YOUTUBE_HOSTS)) return undefined;
    return url.toString();
  }

  const handle = stripAtHandle(trimmed);
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(handle)) return undefined;
  return `https://www.youtube.com/@${encodeURIComponent(handle)}`;
}

/**
 * Website: https only, any public host (no credentials / dangerous schemes).
 * Bare hostnames get https:// prefix.
 */
export function mapSafeWebsiteHref(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed === "#" || trimmed.startsWith("#")) return undefined;

  const url = parseSafeHttpsUrl(trimmed);
  if (!url) return undefined;
  if (hostAllowed(url.hostname, INSTAGRAM_HOSTS)) {
    /* website slot may still point at a site; allow */
  }
  return url.toString();
}

/** Sanitize storefront socials map; omit keys that fail allowlist. */
export function mapSafeStorefrontSocials(raw: {
  instagram?: string;
  website?: string;
  youtube?: string;
}): PublicStorefront["socials"] {
  const socials: PublicStorefront["socials"] = {};
  const instagram = mapSafeInstagramHref(raw.instagram);
  const website = mapSafeWebsiteHref(raw.website);
  const youtube = mapSafeYoutubeHref(raw.youtube);
  if (instagram) socials.instagram = instagram;
  if (website) socials.website = website;
  if (youtube) socials.youtube = youtube;
  return socials;
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
  if (dto.status !== undefined) {
    view.status = mapProductStatus(dto.status);
  }
  if (dto.storeSlug !== undefined && dto.storeSlug !== "") {
    view.storeSlug = dto.storeSlug;
  }
  if (dto.storeId !== undefined && dto.storeId !== "") {
    view.storeId = dto.storeId;
  }
  if (dto.badge !== undefined) view.badge = dto.badge;
  if (dto.allowPayWhatYouWant !== undefined) {
    view.allowPayWhatYouWant = dto.allowPayWhatYouWant;
  }
  if (dto.minimumPrice !== undefined) {
    view.minimumPrice = requireSafeMoneyIdr(dto.minimumPrice, "minimumPrice");
  }
  if (dto.updatesEnabled !== undefined)
    view.updatesEnabled = dto.updatesEnabled;
  if (dto.currentVersion !== undefined)
    view.currentVersion = dto.currentVersion;
  return view;
}

export function mapCatalogProductListDto(
  items: CatalogProductDto[],
): CatalogProduct[] {
  return items.map(mapCatalogProductDto);
}

/** Featured DTO must carry storeSlug (fail closed if missing). */
export function mapFeaturedCatalogProductDto(
  dto: FeaturedCatalogProductDto,
): FeaturedCatalogProduct {
  const base = mapCatalogProductDto(dto);
  const storeSlug = dto.storeSlug?.trim();
  if (!storeSlug) {
    return invalidApiContract("Featured product missing storeSlug", {
      issues: [
        { path: "storeSlug", message: "required for public featured links" },
      ],
    });
  }
  return { ...base, storeSlug };
}

export function mapFeaturedCatalogProductListDto(
  items: FeaturedCatalogProductDto[],
): FeaturedCatalogProduct[] {
  return items.map(mapFeaturedCatalogProductDto);
}

/** Canonical public product path for a store-bound product. */
export function publicProductHref(
  storeSlug: string,
  productSlug: string,
): string {
  return `/@${storeSlug}/${productSlug}`;
}

export function publicStoreHref(storeSlug: string): string {
  return `/@${storeSlug}`;
}

/**
 * Attach storeSlug to storefront products (BE storefront products may omit storeSlug).
 */
export function mapPublicStorefrontDtoWithStoreSlug(
  dto: PublicStorefrontDto,
): PublicStorefront {
  const view = mapPublicStorefrontDto(dto);
  const storeIdFromProducts = view.products.find((p) => p.storeId)?.storeId;
  if (storeIdFromProducts && !view.storeId) {
    view.storeId = storeIdFromProducts;
  }
  view.products = view.products.map((p) => {
    let next = p;
    if (!next.storeSlug) next = { ...next, storeSlug: view.slug };
    if (!next.storeId && view.storeId)
      next = { ...next, storeId: view.storeId };
    return next;
  });
  return view;
}

export function toPublicProductMatch(
  product: CatalogProduct,
  storeSlug: string,
): PublicProductMatch {
  return {
    product: product.storeSlug ? product : { ...product, storeSlug },
    storeSlug,
  };
}

/** Map wire PublicStorefront DTO to frozen PublicStorefront view model. */
export function mapPublicStorefrontDto(
  dto: PublicStorefrontDto,
): PublicStorefront {
  const sections = (dto.sections ?? []).map((section) =>
    mapOptionalEnum(section, SECTION, "storefront.sections", "products"),
  );

  const socialsRaw = dto.socials ?? {};
  const socials = mapSafeStorefrontSocials({
    instagram:
      typeof socialsRaw.instagram === "string"
        ? socialsRaw.instagram
        : undefined,
    website:
      typeof socialsRaw.website === "string" ? socialsRaw.website : undefined,
    youtube:
      typeof socialsRaw.youtube === "string" ? socialsRaw.youtube : undefined,
  });

  const view: PublicStorefront = {
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
    texture: mapOptionalEnum(
      dto.texture,
      TEXTURE,
      "storefront.texture",
      "none",
    ),
    radius: mapOptionalEnum(dto.radius, RADIUS, "storefront.radius", "soft"),
    headerAlign: mapOptionalEnum(
      dto.headerAlign,
      HEADER_ALIGN,
      "storefront.headerAlign",
      "left",
    ),
    announcement: dto.announcement,
    featuredProductIds: dto.featuredProductIds
      ? [...dto.featuredProductIds]
      : [],
    sections,
    socials,
    trustBadges: dto.trustBadges ? [...dto.trustBadges] : [],
    rating: dto.rating ?? 0,
    reviewCount: dto.reviewCount ?? 0,
    products: mapCatalogProductListDto(dto.products),
  };
  if (dto.storeId !== undefined && dto.storeId !== "") {
    view.storeId = dto.storeId;
  }
  return view;
}
