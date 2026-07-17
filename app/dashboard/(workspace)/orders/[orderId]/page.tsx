import { SellerOrderDetailScreen } from "@/features/seller/screens/orders";
import { getSellerOrder } from "@/features/orders/api";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { getDomainSource } from "@/shared/data/domain-source";
import { notFound } from "next/navigation";

export default async function SellerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (getDomainSource("sellerOperations") === "mock") {
    if (!(await getSellerOrder(DEMO_STORE_ID, orderId))) notFound();
  }
  return <SellerOrderDetailScreen id={orderId} />;
}
