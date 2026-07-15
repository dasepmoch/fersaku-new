import { SellerOrderDetailScreen } from "@/features/seller/screens/orders";

export default async function SellerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <SellerOrderDetailScreen id={orderId} />;
}
