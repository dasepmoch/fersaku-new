import { BuyerShell } from "@/features/buyer/components/buyer-shell";
import { BuyerSecurity } from "@/features/buyer/screens/buyer-pages";
export default function BuyerSecurityPage() {
  return (
    <BuyerShell
      title="Keamanan akun."
      description="Tinjau perangkat aktif, magic-link activity, dan cabut sesi yang tidak dikenali."
    >
      <BuyerSecurity />
    </BuyerShell>
  );
}
