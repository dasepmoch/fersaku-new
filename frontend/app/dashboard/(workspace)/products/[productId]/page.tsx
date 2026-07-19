import { SellerProductDetailScreen } from "@/features/seller/screens/products";
import { getSellerProduct } from "@/features/catalog/api";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { getDomainSource } from "@/shared/data/domain-source";
import { notFound } from "next/navigation";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  // Mock-only existence check; API mode relies on client store context + BE (INT-150).
  if (getDomainSource("sellerCatalog") === "mock") {
    if (!(await getSellerProduct(DEMO_STORE_ID, productId))) notFound();
  }
  return <SellerProductDetailScreen id={productId} />;
}
