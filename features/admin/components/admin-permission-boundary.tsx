"use client";

import { ShieldX } from "lucide-react";

const mockPermissions = new Set(["*"]);

export function AdminPermissionBoundary({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const allowed = mockPermissions.has("*") || mockPermissions.has(permission);
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
