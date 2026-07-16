"use client";

import Link from "next/link";
import { ArrowUpRight, Eye, Plus } from "lucide-react";

export function DashboardAction({ segments }: { segments: string[] }) {
  const s = segments[0] || "overview";
  if (s === "products" && !segments[1])
    return (
      <div className="flex gap-2">
        <ActionLink href="/dashboard/products/prod_01">
          <Eye className="size-4" /> Detail produk
        </ActionLink>
        <ActionLink href="/dashboard/products/new">
          <Plus className="size-4" /> Produk baru
        </ActionLink>
      </div>
    );
  if (s === "orders" && !segments[1])
    return (
      <ActionLink href="/dashboard/orders/FRS-240712-1842">
        <Eye className="size-4" /> Detail pesanan
      </ActionLink>
    );
  if (s === "customers" && !segments[1])
    return (
      <ActionLink href="/dashboard/customers/FRS-240712-1842">
        <Eye className="size-4" /> Detail pelanggan
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
  if (s === "inventory" && !segments[1])
    return (
      <ActionLink href="/dashboard/inventory/prod_account">
        <Plus className="size-4" /> Kelola stok akun
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
