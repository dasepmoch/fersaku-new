import { products as fixtureProducts } from "@/lib/mock-data";
import {
  findProduct as findFixtureProduct,
  getStorefront as getFixtureStorefront,
  storefronts,
} from "@/lib/storefront-mock-data";
import type { CatalogProduct, PublicStorefront } from "./contracts";

function withStoreSlug(
  products: CatalogProduct[],
  storeSlug: string,
): CatalogProduct[] {
  return products.map((p) => ({ ...p, storeSlug: p.storeSlug || storeSlug }));
}

/** Deterministic catalog fixtures. Presentation must consume these via api/hooks. */
export const demoProducts: CatalogProduct[] = (() => {
  const asep = storefronts["asep-ai-tools"];
  if (asep) return withStoreSlug(fixtureProducts as CatalogProduct[], asep.slug);
  return fixtureProducts as CatalogProduct[];
})();

export function getDemoStorefront(slug: string): PublicStorefront | null {
  const storefront = getFixtureStorefront(slug);
  if (!storefront) return null;
  return {
    ...storefront,
    products: withStoreSlug(
      storefront.products as CatalogProduct[],
      storefront.slug,
    ),
  } as PublicStorefront;
}

export function findDemoProduct(productIdOrSlug: string) {
  const match = findFixtureProduct(productIdOrSlug);
  if (!match) return null;
  const storeSlug = match.store.slug;
  return {
    store: {
      ...match.store,
      products: withStoreSlug(
        match.store.products as CatalogProduct[],
        storeSlug,
      ),
    } as PublicStorefront,
    product: {
      ...(match.product as CatalogProduct),
      storeSlug,
    },
  };
}
