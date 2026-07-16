import { SellerOrderDetailScreen } from "@/features/seller/screens/orders";
import { getSellerOrder } from "@/features/orders/api";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { notFound } from "next/navigation";

export default async function SellerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!(await getSellerOrder(DEMO_STORE_ID, orderId))) notFound();
  return <SellerOrderDetailScreen id={orderId} />;
}
