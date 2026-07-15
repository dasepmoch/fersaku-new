import { InvoiceView } from "@/components/invoice-view";
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <InvoiceView orderId={orderId} />;
}
