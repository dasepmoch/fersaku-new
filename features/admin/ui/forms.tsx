"use client";

import type { ReactNode } from "react";

export function SettingsGroup({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-7 border-b border-[#e5e8ef] pb-7 last:border-0">
      <h3 className="text-[11px] font-black">{title}</h3>
      <p className="mt-1 mb-5 text-[8px] text-[#8490a5]">{desc}</p>
      {children}
    </div>
  );
}

export function AdminInput({
  label,
  value,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="grid gap-2 text-[9px] font-extrabold">
      {label}
      <div className="flex h-11 overflow-hidden rounded-xl border border-[#dce1e9] bg-white">
        {prefix && (
          <span className="grid place-items-center border-r border-[#e2e5ec] bg-[#f5f6f9] px-3 text-[9px] text-[#798499]">
            {prefix}
          </span>
        )}
        <input
          defaultValue={value}
          className="min-w-0 flex-1 px-3 text-[10px] outline-none"
        />
        {suffix && (
          <span className="grid place-items-center border-l border-[#e2e5ec] bg-[#f5f6f9] px-3 text-[9px] text-[#798499]">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

export function Toggle({
  value,
  onChange,
  danger = false,
}: {
  value: boolean;
  onChange: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? (danger ? "bg-[#d95850]" : "bg-[#5b7cfa]") : "bg-[#cfd4df]"}`}
    >
      <span
        className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${value ? "left-6" : "left-1"}`}
      />
    </button>
  );
}
