"use client";

import { usePathname } from "next/navigation";
import { DashboardAction } from "@/features/seller/screens/actions";
import { DashboardShell } from "./dashboard-shell";
import {
  getSellerPageMeta,
  getSellerSegments,
} from "@/features/seller/config/routes";

export function SellerDashboardFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const segments = getSellerSegments(usePathname());
  const meta = getSellerPageMeta(segments);

  return (
    <DashboardShell
      title={meta.title}
      description={meta.description}
      action={<DashboardAction segments={segments} />}
    >
      {children}
    </DashboardShell>
  );
}
