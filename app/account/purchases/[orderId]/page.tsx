import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer-shell";
import { PurchaseDetail } from "@/components/buyer-pages";
import { buyerPurchases } from "@/lib/buyer-mock-data";
export default async function PurchasePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const purchase = buyerPurchases.find((p) => p.orderId === orderId);
  if (!purchase) notFound();
  return (
    <BuyerShell
      title="Detail pembelian."
      description="Akses produk, receipt, update seller, dan riwayat delivery."
    >
      <PurchaseDetail purchase={purchase} />
    </BuyerShell>
  );
}
