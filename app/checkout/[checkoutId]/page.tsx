import { notFound } from "next/navigation";
import { CheckoutExperience } from "@/features/commerce/checkout/checkout-experience";
import { findPublicProduct, getPublicStorefront } from "@/features/catalog/api";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkoutId: string }>;
  searchParams: Promise<{ store?: string }>;
}) {
  const { checkoutId } = await params;
  const query = await searchParams;
  const match = await findPublicProduct(checkoutId);
  const store = query.store
    ? await getPublicStorefront(query.store)
    : match?.store;
  const product =
    store?.products.find((p) => p.id === checkoutId) || match?.product;
  if (!store || !product) notFound();
  return <CheckoutExperience product={product} store={store} />;
}
