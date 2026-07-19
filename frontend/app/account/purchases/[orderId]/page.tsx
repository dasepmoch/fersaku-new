import { notFound } from "next/navigation";
import { BuyerShell } from "@/features/buyer/components/buyer-shell";
import { PurchaseDetail } from "@/features/buyer/screens/buyer-pages";
import { getBuyerPurchaseServer } from "@/features/buyer/data/server";
import { getDomainSource } from "@/shared/data/domain-source";
import { getBuyerPurchase } from "@/features/buyer/data";

export const dynamic = "force-dynamic";

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const source = getDomainSource("buyer");
  const purchase =
    source === "api"
      ? await getBuyerPurchaseServer(orderId)
      : await getBuyerPurchase(orderId);
  if (!purchase) notFound();
  return (
    <BuyerShell
      title="Detail pembelian."
      description="Akses produk, receipt, update seller, dan riwayat delivery."
    >
      <PurchaseDetail
        key={purchase.internalOrderId || purchase.orderId}
        purchase={purchase}
      />
    </BuyerShell>
  );
}
