import { SellerDashboardFrame } from "@/features/seller/components/seller-dashboard-frame";
import { PrivateSurfaceShell } from "@/shared/auth/private-surface-shell";

export default function SellerWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivateSurfaceShell surface="seller">
      <SellerDashboardFrame>{children}</SellerDashboardFrame>
    </PrivateSurfaceShell>
  );
}
