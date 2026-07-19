"use client";

import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";

export function DashboardAction({ segments }: { segments: string[] }) {
  const s = segments[0] || "overview";
  if (s === "products" && !segments[1])
    return (
      <ActionLink href="/dashboard/products/new">
        <Plus className="size-4" /> Produk baru
      </ActionLink>
    );
  if (s === "coupons" && !segments[1])
    return (
      <ActionLink href="/dashboard/coupons/new">
        <Plus className="size-4" /> Buat kupon
      </ActionLink>
    );
  if (s === "withdrawals" && !segments[1])
    return (
      <ActionLink href="/dashboard/withdrawals/new">
        <ArrowUpRight className="size-4" /> Tarik saldo
      </ActionLink>
    );
  return null;
}
function ActionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#173f2c] px-4 text-xs font-extrabold text-white shadow-sm transition hover:-translate-y-0.5"
    >
      {children}
    </Link>
  );
}
