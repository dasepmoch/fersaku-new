import { SellerInventoryDetailScreen } from "@/features/seller/screens/inventory";
import { getSellerInventoryProduct } from "@/features/seller/inventory/api";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { notFound } from "next/navigation";

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  if (!(await getSellerInventoryProduct(DEMO_STORE_ID, productId))) notFound();
  return <SellerInventoryDetailScreen id={productId} />;
}
