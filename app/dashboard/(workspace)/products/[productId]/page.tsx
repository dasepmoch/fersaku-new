import { SellerProductDetailScreen } from "@/features/seller/screens/products";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <SellerProductDetailScreen id={productId} />;
}
