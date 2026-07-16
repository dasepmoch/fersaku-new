"use client";

import { ShieldX } from "lucide-react";
import { createMockSession, hasPermission } from "@/shared/auth/contracts";

// Prototype-only view policy. Backend authorization remains authoritative.
const mockAdminSession = createMockSession("admin");

export function AdminPermissionBoundary({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const allowed = hasPermission(mockAdminSession, permission);
  if (allowed) return children;

  return (
    <section className="rounded-[24px] border border-[#e6cad0] bg-[#fff4f5] p-8 text-[#763d48]">
      <ShieldX className="size-7" />
      <h2 className="mt-5 text-xl font-black">Permission required</h2>
      <p className="mt-2 text-sm opacity-70">
        Your administrator role does not include <code>{permission}</code>.
      </p>
    </section>
  );
}
