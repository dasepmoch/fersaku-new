import { SellerDashboardFrame } from "@/features/seller/components/seller-dashboard-frame";

export default function SellerWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SellerDashboardFrame>{children}</SellerDashboardFrame>;
}
