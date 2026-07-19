import { BuyerShell } from "@/features/buyer/components/buyer-shell";
import { PurchaseLibrary } from "@/features/buyer/screens/buyer-pages";
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
