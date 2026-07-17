"use client";

import { usePathname } from "next/navigation";
import { AdminAction } from "@/features/admin/screens/actions";
import { AdminShell } from "./admin-shell";
import { AdminPermissionBoundary } from "./admin-permission-boundary";
import {
  getAdminPageMeta,
  getAdminSegments,
} from "@/features/admin/config/routes";

export function AdminConsoleFrame({ children }: { children: React.ReactNode }) {
  const segments = getAdminSegments(usePathname());
  const section = segments[0] || "overview";
  const meta = getAdminPageMeta(segments);

  return (
    <AdminShell
      title={meta.title}
      description={meta.description}
      action={<AdminAction section={section} />}
    >
      <AdminPermissionBoundary
        permission={meta.permission}
        disposition={meta.disposition}
      >
        {children}
      </AdminPermissionBoundary>
    </AdminShell>
  );
}
