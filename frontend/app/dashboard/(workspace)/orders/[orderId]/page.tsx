import { SellerOrderDetailScreen } from "@/features/seller/screens/orders";
import { getSellerOrderServer } from "@/features/orders/server";

export default async function SellerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  await getSellerOrderServer(orderId);
  return <SellerOrderDetailScreen id={orderId} />;
}
