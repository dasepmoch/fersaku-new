import { AdminWithdrawalDetailScreen } from "@/features/admin/screens/withdrawals";

export default async function AdminWithdrawalDetailPage({
  params,
}: {
  params: Promise<{ withdrawalId: string }>;
}) {
  const { withdrawalId } = await params;
  return <AdminWithdrawalDetailScreen id={withdrawalId} />;
}
