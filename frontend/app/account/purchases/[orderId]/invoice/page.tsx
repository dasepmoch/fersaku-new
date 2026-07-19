import { notFound } from "next/navigation";
import { InvoiceView } from "@/components/invoice-view";
import {
  getBuyerInvoice,
  isBuyerInvoiceApiDomain,
} from "@/features/commerce/invoice";
import { getBuyerInvoiceServer } from "@/features/commerce/invoice/server";
import { getDomainSource } from "@/shared/data/domain-source";

export const dynamic = "force-dynamic";

export default async function BuyerInvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const source = getDomainSource("buyer");
  if (source === "disabled") notFound();

  const projection = isBuyerInvoiceApiDomain()
    ? await getBuyerInvoiceServer(orderId)
    : await getBuyerInvoice(orderId);

  if (!projection) notFound();

  return (
    <InvoiceView
      orderId={projection.orderNumber || projection.orderId || orderId}
      projection={projection}
    />
  );
}
