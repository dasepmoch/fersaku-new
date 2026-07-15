import { BuyerShell } from "@/components/buyer-shell";
import { PurchaseLibrary } from "@/components/buyer-pages";
export default function PurchasesPage() {
  return (
    <BuyerShell
      title="Koleksi pembelianmu."
      description="File, link, credential, dan kode digital yang pernah kamu beli melalui Fersaku."
    >
      <PurchaseLibrary />
    </BuyerShell>
  );
}
