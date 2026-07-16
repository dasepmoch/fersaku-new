"use client";

import { Code2, Layers3, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminTransactionSource } from "@/features/admin/data/contracts";
import { cn } from "@/lib/utils";

export type AdminTransactionSourceFilter = AdminTransactionSource | "ALL";

export const transactionSourceLabels: Record<AdminTransactionSource, string> = {
  STOREFRONT: "Storefront",
  QRIS_API: "QRIS API",
  MIXED: "Mixed",
};

const sourceIcons: Record<AdminTransactionSource, LucideIcon> = {
  STOREFRONT: Store,
  QRIS_API: Code2,
  MIXED: Layers3,
};

/** Compact source tag shared by orders, payments, and withdrawals. */
export function TransactionSourceBadge({
  source,
}: {
  source: AdminTransactionSource;
}) {
  const Icon = sourceIcons[source];
  const api = source === "QRIS_API";
  const mixed = source === "MIXED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[7px] font-extrabold whitespace-nowrap",
        api
          ? "bg-[#edf1ff] text-[#536fdf]"
          : mixed
            ? "bg-[#fff6e4] text-[#9b6a1f]"
            : "bg-[#eef8f2] text-[#287d4c]",
      )}
      title={
        api
          ? "Pembayaran dibuat melalui Live QRIS API"
          : mixed
            ? "Penarikan menggunakan saldo Storefront dan QRIS API"
            : "Pembayaran dibuat melalui hosted storefront"
      }
    >
      <Icon className="size-3" aria-hidden="true" />
      {transactionSourceLabels[source]}
    </span>
  );
}

/** Native select styling aligned with the existing admin table toolbars. */
export function TransactionSourceFilter({
  value,
  onChange,
  label = "Transaction source",
  includeMixed = false,
}: {
  value: AdminTransactionSourceFilter;
  onChange: (value: AdminTransactionSourceFilter) => void;
  label?: string;
  includeMixed?: boolean;
}) {
  return (
    <label className="flex h-10 items-center rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold text-[#667188]">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) =>
          onChange(event.target.value as AdminTransactionSourceFilter)
        }
        className="bg-transparent outline-none"
      >
        <option value="ALL">All sources</option>
        <option value="STOREFRONT">Storefront</option>
        <option value="QRIS_API">QRIS API</option>
        {includeMixed && <option value="MIXED">Mixed wallet source</option>}
      </select>
    </label>
  );
}
