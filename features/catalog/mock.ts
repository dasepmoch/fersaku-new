import { products as fixtureProducts } from "@/lib/mock-data";
import {
  findProduct as findFixtureProduct,
  getStorefront as getFixtureStorefront,
  storefronts,
} from "@/lib/storefront-mock-data";
import type { CatalogProduct, PublicStorefront } from "./contracts";
import { mapSafeStorefrontSocials } from "./mappers";

/** Deterministic mock store ids for checkout quote (CHK-100). */
const DEMO_STORE_IDS: Record<string, string> = {
  "asep-ai-tools": "store_demo_asep_ai_tools",
  "designkit-studio": "store_demo_designkit_studio",
};

function withStoreIdentity(
  products: CatalogProduct[],
  storeSlug: string,
): CatalogProduct[] {
  const storeId = DEMO_STORE_IDS[storeSlug];
  return products.map((p) => ({
    ...p,
    storeSlug: p.storeSlug || storeSlug,
    ...(storeId && !p.storeId ? { storeId } : {}),
  }));
}

/** Deterministic catalog fixtures. Presentation must consume these via api/hooks. */
export const demoProducts: CatalogProduct[] = (() => {
  const asep = storefronts["asep-ai-tools"];
  if (asep) {
    return withStoreIdentity(fixtureProducts as CatalogProduct[], asep.slug);
  }
  return fixtureProducts as CatalogProduct[];
})();

export function getDemoStorefront(slug: string): PublicStorefront | null {
  const storefront = getFixtureStorefront(slug);
  if (!storefront) return null;
  const storeId = DEMO_STORE_IDS[storefront.slug];
  return {
    ...storefront,
    ...(storeId ? { storeId } : {}),
    socials: mapSafeStorefrontSocials(storefront.socials ?? {}),
    products: withStoreIdentity(
      storefront.products as CatalogProduct[],
      storefront.slug,
    ),
  } as PublicStorefront;
}

export function findDemoProduct(productIdOrSlug: string) {
  const match = findFixtureProduct(productIdOrSlug);
  if (!match) return null;
  const storeSlug = match.store.slug;
  const storeId = DEMO_STORE_IDS[storeSlug];
  return {
    store: {
      ...match.store,
      ...(storeId ? { storeId } : {}),
      products: withStoreIdentity(
        match.store.products as CatalogProduct[],
        storeSlug,
      ),
    } as PublicStorefront,
    product: {
      ...(match.product as CatalogProduct),
      storeSlug,
      ...(storeId ? { storeId } : {}),
    },
  };
}
