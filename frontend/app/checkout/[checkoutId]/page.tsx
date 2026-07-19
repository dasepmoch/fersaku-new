import { notFound } from "next/navigation";
import { CheckoutExperience } from "@/features/commerce/checkout/checkout-experience";
import type { CatalogProduct } from "@/features/catalog/contracts";
import {
  findPublicProduct,
  getPublicProduct,
  getPublicStorefront,
} from "@/features/catalog/api";

/**
 * Checkout bootstrap (CHK-100): resolve product/store via public catalog API.
 * `checkoutId` is product id (or slug); optional `?store=` binds dual-store safely.
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkoutId: string }>;
  searchParams: Promise<{ store?: string }>;
}) {
  const { checkoutId } = await params;
  const query = await searchParams;
  const storeSlug = query.store?.trim();

  if (storeSlug) {
    const match = await getPublicProduct(checkoutId, { storeSlug });
    if (!match) notFound();
    const store = await getPublicStorefront(storeSlug);
    if (!store) notFound();
    const fromStore = store.products.find(
      (p) => p.id === match.product.id || p.slug === match.product.slug,
    );
    const product: CatalogProduct = fromStore
      ? {
          ...fromStore,
          storeSlug: fromStore.storeSlug || store.slug,
          storeId: fromStore.storeId || match.product.storeId || store.storeId,
        }
      : {
          ...match.product,
          storeSlug: match.product.storeSlug || store.slug,
          storeId: match.product.storeId || store.storeId,
        };
    return <CheckoutExperience product={product} store={store} />;
  }

  const match = await findPublicProduct(checkoutId);
  if (!match?.product || !match.store) notFound();
  const product: CatalogProduct = {
    ...match.product,
    storeSlug: match.product.storeSlug || match.store.slug,
    storeId: match.product.storeId || match.store.storeId,
  };
  return <CheckoutExperience product={product} store={match.store} />;
}
