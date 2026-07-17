/**
 * QLT-200 foundation sample fixtures — public catalog (INT-010 / PUB-100 pilot).
 * Schema-valid builders for provider/consumer contract samples.
 * Domain tasks own additional fixtures under tests/contract/fixtures/<domain>.ts.
 */

import { FOUNDATION_META, successEnvelope } from "../helpers/consumer";

/** Minimal CatalogProduct DTO matching OpenAPI required fields + featured storeSlug. */
export function catalogProductDto(
  overrides: Partial<{
    id: string;
    slug: string;
    title: string;
    short: string;
    description: string;
    price: number;
    type: "download" | "link" | "code";
    sales: number;
    palette: string;
    glyph: string;
    includes: string[];
    storeSlug: string;
    storeId: string;
    status: "draft" | "published" | "archived";
    badge: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "prod_qlt200_01",
    slug: overrides.slug ?? "ai-prompt-pack",
    title: overrides.title ?? "AI Prompt Pack",
    short: overrides.short ?? "Short blurb",
    description: overrides.description ?? "Long description",
    price: overrides.price ?? 149_000,
    type: overrides.type ?? ("download" as const),
    sales: overrides.sales ?? 12,
    palette: overrides.palette ?? "violet",
    glyph: overrides.glyph ?? "✦",
    includes: overrides.includes ?? ["PDF", "Notion"],
    storeSlug: overrides.storeSlug ?? "designkit-studio",
    ...(overrides.storeId !== undefined ? { storeId: overrides.storeId } : {}),
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
    ...(overrides.badge !== undefined ? { badge: overrides.badge } : {}),
  };
}

/** Featured list success envelope (listFeaturedProducts). */
export function featuredProductsEnvelope(
  products = [catalogProductDto()],
  meta = FOUNDATION_META,
) {
  return successEnvelope(products, meta);
}

/** Single product success envelope. */
export function catalogProductEnvelope(
  product = catalogProductDto(),
  meta = FOUNDATION_META,
) {
  return successEnvelope(product, meta);
}

/** Malformed envelope — missing meta (must fail consumer schema). */
export function malformedProductEnvelopeMissingMeta() {
  return { data: catalogProductDto() };
}

/** Invalid money (float) — must fail moneyIdrSchema. */
export function invalidMoneyProductDto() {
  return catalogProductDto({ price: 149_000.5 as unknown as number });
}

/** Unknown product type — schema may reject or mapper fail-closed. */
export function unknownTypeProductDto() {
  return {
    ...catalogProductDto(),
    type: "subscription" as "download",
  };
}

/** Empty featured list (valid). */
export function emptyFeaturedEnvelope(meta = FOUNDATION_META) {
  return successEnvelope([], meta);
}
