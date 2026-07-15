import { SellerInventoryDetailScreen } from "@/features/seller/screens/inventory";

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <SellerInventoryDetailScreen id={productId} />;
}
