"use client";

import { ShieldX } from "lucide-react";
import {
  canAccessAdminPage,
  type AdminPageMeta,
} from "@/features/admin/config/routes";
import { useSession } from "@/shared/auth/session-provider";
import { getDomainSource } from "@/shared/data/domain-source";

/**
 * ADM-110 / INT-120: API mode uses bootstrap claims; mock keeps prototype via mock claims.
 * Backend authorization remains authoritative on every command.
 */
export function AdminPermissionBoundary({
  permission,
  disposition = "active",
  children,
}: {
  /** Route minimum permission, or null for authenticated-admin-only surfaces. */
  permission: AdminPageMeta["permission"];
  disposition?: AdminPageMeta["disposition"];
  children: React.ReactNode;
}) {
  const { claims, ready, isAuthenticated } = useSession();

  // Wait for bootstrap so API mode never flash-allows on hardcoded mock.
  if (!ready) {
    return null;
  }

  let source: "mock" | "api" | "disabled" = "mock";
  try {
    source = getDomainSource("auth");
  } catch {
    source = "mock";
  }

  const displayCode = permission ?? "admin.session";

  // API mode without session: guard already redirected; deny here fail-closed.
  if (source === "api" && !isAuthenticated) {
    return (
      <section className="rounded-[24px] border border-[#e6cad0] bg-[#fff4f5] p-8 text-[#763d48]">
        <ShieldX className="size-7" />
        <h2 className="mt-5 text-xl font-black">Permission required</h2>
        <p className="mt-2 text-sm opacity-70">
          Your administrator role does not include <code>{displayCode}</code>.
        </p>
      </section>
    );
  }

  const meta: AdminPageMeta = {
    title: "",
    description: "",
    permission,
    disposition,
  };
  const allowed = canAccessAdminPage(meta, claims);
  if (allowed) return children;

  return (
    <section className="rounded-[24px] border border-[#e6cad0] bg-[#fff4f5] p-8 text-[#763d48]">
      <ShieldX className="size-7" />
      <h2 className="mt-5 text-xl font-black">Permission required</h2>
      <p className="mt-2 text-sm opacity-70">
        Your administrator role does not include <code>{displayCode}</code>.
      </p>
    </section>
  );
}
