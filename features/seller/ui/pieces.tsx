"use client";

import { Filter, Search } from "lucide-react";
import type { ReactNode } from "react";
import { surfaceCard } from "@/shared/ui/styles";
import {
  isSellerPendingStatus,
  isSellerPositiveStatus,
} from "@/shared/format/status";

export { MiniStat } from "@/shared/ui/mini-stat";

/** Seller surface card token (same visual as historical local `card` constants). */
export const sellerCard = surfaceCard;

export function SearchBox({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="hairline flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border bg-white px-3 text-[10px] text-[#829087]">
      <Search className="size-3.5" />
      <input
        placeholder={placeholder}
        value={value}
        onChange={
          onChange ? (e) => onChange(e.target.value) : undefined
        }
        className="min-w-0 flex-1 bg-transparent outline-none"
      />
    </div>
  );
}

export function FilterButton() {
  return (
    <button className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold">
      <Filter className="size-3.5" /> Filter
    </button>
  );
}

export function Status({ status }: { status: string }) {
  const positive = isSellerPositiveStatus(status);
  const pending = isSellerPendingStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-extrabold ${positive ? "bg-[#e5f5e6] text-[#2e714f]" : pending ? "bg-[#fff4ce] text-[#8a6c22]" : "bg-[#ffebe3] text-[#a7573e]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function FormGroup({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="hairline border-b pb-7 last:border-0">
      <div className="mb-5">
        <h2 className="text-sm font-extrabold">{label}</h2>
        <p className="mt-1 text-[10px] text-[#7b8780]">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export function Input({
  label,
  placeholder,
  prefix,
  value,
  onChange,
  error,
}: {
  label: string;
  placeholder?: string;
  prefix?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string | null;
}) {
  const controlled = typeof onChange === "function";
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <div className="hairline flex h-12 overflow-hidden rounded-xl border bg-white">
        {prefix && (
          <span className="hairline flex items-center border-r bg-[#f3f4ef] px-3 text-[10px] font-semibold text-[#77837b]">
            {prefix}
          </span>
        )}
        <input
          {...(controlled
            ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
            : { defaultValue: value })}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-4 text-sm font-normal outline-none"
        />
      </div>
      {error ? (
        <span className="text-[9px] font-semibold text-[#a44f3b]">{error}</span>
      ) : null}
    </label>
  );
}

export function Select({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <select className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none">
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
