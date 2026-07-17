import { SellerDashboardFrame } from "@/features/seller/components/seller-dashboard-frame";
import { PrivateSurfaceShell } from "@/shared/auth/private-surface-shell";
import { CurrentStoreProvider } from "@/shared/seller/current-store";

export default function SellerWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivateSurfaceShell surface="seller">
      <CurrentStoreProvider>
        <SellerDashboardFrame>{children}</SellerDashboardFrame>
      </CurrentStoreProvider>
    </PrivateSurfaceShell>
  );
}
