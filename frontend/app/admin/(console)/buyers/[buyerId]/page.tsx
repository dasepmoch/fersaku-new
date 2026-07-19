import { AdminBuyerDetailScreen } from "@/features/admin/screens/buyers";

export default async function AdminBuyerDetailPage({
  params,
}: {
  params: Promise<{ buyerId: string }>;
}) {
  const { buyerId } = await params;
  return <AdminBuyerDetailScreen id={buyerId} />;
}
