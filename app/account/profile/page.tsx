import { BuyerShell } from "@/features/buyer/components/buyer-shell";
import { BuyerProfile } from "@/features/buyer/screens/buyer-pages";
export default function BuyerProfilePage() {
  return (
    <BuyerShell
      title="Profil buyer."
      description="Kelola identitas, email utama, bahasa, dan preferensi komunikasi."
    >
      <BuyerProfile />
    </BuyerShell>
  );
}
