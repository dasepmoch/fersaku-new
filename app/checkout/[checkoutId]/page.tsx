import { notFound } from "next/navigation";
import { CheckoutExperience } from "@/components/checkout-experience";
import { findProduct, getStorefront } from "@/lib/storefront-mock-data";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ checkoutId: string }>;
  searchParams: Promise<{ store?: string }>;
}) {
  const { checkoutId } = await params;
  const query = await searchParams;
  const match = findProduct(checkoutId);
  const store = query.store ? getStorefront(query.store) : match?.store;
  const product =
    store?.products.find((p) => p.id === checkoutId) || match?.product;
  if (!store || !product) notFound();
  return <CheckoutExperience product={product} store={store} />;
}
