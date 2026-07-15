import { SellerCustomerDetailScreen } from "@/features/seller/screens/customers";

export default async function SellerCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <SellerCustomerDetailScreen id={customerId} />;
}
