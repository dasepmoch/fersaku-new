import { AdminOrderDetailScreen } from "@/features/admin/screens/orders";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <AdminOrderDetailScreen id={orderId} />;
}
