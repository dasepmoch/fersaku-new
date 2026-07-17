import { notFound } from "next/navigation";
import { InvoiceView } from "@/components/invoice-view";
import {
  getOrderInvoice,
  isOrderInvoiceApiDomain,
} from "@/features/commerce/invoice";
import { getOrderInvoiceServer } from "@/features/commerce/invoice/server";
import { getDomainSource } from "@/shared/data/domain-source";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const source = getDomainSource("checkout");
  if (source === "disabled") notFound();

  const projection = isOrderInvoiceApiDomain()
    ? await getOrderInvoiceServer(orderId)
    : await getOrderInvoice(orderId);

  if (!projection) notFound();

  return (
    <InvoiceView
      orderId={projection.orderNumber || projection.orderId || orderId}
      projection={projection}
    />
  );
}
