import { notFound } from "next/navigation";
import { BuyerShell } from "@/features/buyer/components/buyer-shell";
import { PurchaseDetail } from "@/features/buyer/screens/buyer-pages";
import { getBuyerPurchase } from "@/features/buyer/data";
export default async function PurchasePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const purchase = await getBuyerPurchase(orderId);
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
