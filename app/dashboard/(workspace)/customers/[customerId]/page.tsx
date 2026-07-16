import { SellerCustomerDetailScreen } from "@/features/seller/screens/customers";
import { getSellerCustomer } from "@/features/seller/customers/api";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { notFound } from "next/navigation";

export default async function SellerCustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  if (!(await getSellerCustomer(DEMO_STORE_ID, customerId))) notFound();
  return <SellerCustomerDetailScreen id={customerId} />;
}
