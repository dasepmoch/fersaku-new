import { notFound } from "next/navigation";
import { getPublicStorefront } from "@/features/catalog/api";
import { PublicStorefrontView } from "@/features/catalog/storefront-view";

export default async function StorePage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await getPublicStorefront(storeSlug);
  if (!store) notFound();
  return <PublicStorefrontView store={store} />;
}
