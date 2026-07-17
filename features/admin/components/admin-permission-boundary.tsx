"use client";

import { ShieldX } from "lucide-react";
import { useSession } from "@/shared/auth/session-provider";
import { getDomainSource } from "@/shared/data/domain-source";

/**
 * INT-120: API mode uses bootstrap claims; mock domain keeps prototype UX via mock claims.
 * Backend authorization remains authoritative on every command.
 */
export function AdminPermissionBoundary({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const { hasPermission, ready, isAuthenticated } = useSession();

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

  // API mode without session: guard already redirected; deny here fail-closed.
  if (source === "api" && !isAuthenticated) {
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

  const allowed = hasPermission(permission);
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
