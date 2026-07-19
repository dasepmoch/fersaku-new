import { AdminMerchantDetailScreen } from "@/features/admin/screens/merchants";

export default async function AdminMerchantDetailPage({
  params,
}: {
  params: Promise<{ merchantId: string }>;
}) {
  const { merchantId } = await params;
  return <AdminMerchantDetailScreen id={merchantId} />;
}
