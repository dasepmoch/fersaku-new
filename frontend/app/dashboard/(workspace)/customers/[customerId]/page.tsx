import { SellerCustomerDetailScreen } from "@/features/seller/screens/customers";
import { getSellerCustomerServer } from "@/features/seller/customers/server";

export default async function SellerCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  await getSellerCustomerServer(customerId);
  return <SellerCustomerDetailScreen id={customerId} />;
}
