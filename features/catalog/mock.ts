import { products as fixtureProducts } from "@/lib/mock-data";
import {
  findProduct as findFixtureProduct,
  getStorefront as getFixtureStorefront,
} from "@/lib/storefront-mock-data";
import type { CatalogProduct, PublicStorefront } from "./contracts";

/** Deterministic catalog fixtures. Presentation must consume these via api/hooks. */
export const demoProducts: CatalogProduct[] =
  fixtureProducts as CatalogProduct[];

export function getDemoStorefront(slug: string): PublicStorefront | null {
  const storefront = getFixtureStorefront(slug);
  return storefront
    ? ({
        ...storefront,
        products: storefront.products as CatalogProduct[],
      } as PublicStorefront)
    : null;
}

export function findDemoProduct(productIdOrSlug: string) {
  const match = findFixtureProduct(productIdOrSlug);
  return match
    ? {
        store: {
          ...match.store,
          products: match.store.products as CatalogProduct[],
        } as PublicStorefront,
        product: match.product as CatalogProduct,
      }
    : null;
}
