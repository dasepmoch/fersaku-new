import { BuyerShell } from "@/components/buyer-shell";
import { BuyerProfile } from "@/components/buyer-pages";
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
