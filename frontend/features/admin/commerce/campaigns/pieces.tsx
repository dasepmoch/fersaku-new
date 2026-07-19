"use client";

import { adminPanel } from "@/features/admin/ui";

import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ChannelHealth({
  icon: Icon,
  name,
  provider,
  status,
  note,
}: {
  icon: LucideIcon;
  name: string;
  provider: string;
  status: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e1e5ed] p-4">
      <div className="flex items-center">
        <Icon className="size-4 text-[#536fdf]" />
        <span className="ml-auto size-2 rounded-full bg-[#2da467]" />
      </div>
      <b className="mt-4 block text-[9px]">{name}</b>
      <span className="mt-1 block text-[7px] text-[#7c879d]">
        {provider} - {note}
      </span>
      <span className="mt-3 inline-flex rounded-lg bg-[#e7f6ec] px-2 py-1 text-[7px] font-extrabold text-[#238150]">
        {status}
      </span>
    </div>
  );
}

export function OpsMetric({
  icon: Icon,
  label,
  value,
  note,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const color =
    tone === "danger"
      ? "bg-[#fff0ee] text-[#c9544d]"
      : tone === "warning"
        ? "bg-[#fff5df] text-[#ad741f]"
        : tone === "success"
          ? "bg-[#e7f6ec] text-[#238150]"
          : "bg-[#edf1fb] text-[#536fdf]";
  return (
    <div className={`${adminPanel} p-5`}>
      <span className={cn("grid size-10 place-items-center rounded-xl", color)}>
        <Icon className="size-4" />
      </span>
      <p className="mt-5 text-[8px] font-extrabold tracking-[.12em] text-[#7c879d] uppercase">
        {label}
      </p>
      <b className="mt-1 block text-xl tracking-[-.04em]">{value}</b>
      <span className="mt-1 block text-[8px] text-[#7c879d]">{note}</span>
    </div>
  );
}

export function Status({ value }: { value: string }) {
  const good = [
    "Live",
    "Completed",
    "Resolved",
    "PAID",
    "COMPLETED",
    "Available",
    "Released",
  ].includes(value);
  const warning = [
    "Queued",
    "Open",
    "Review",
    "PENDING",
    "PROCESSING",
    "Held",
    "Evidence review",
    "Seller response",
    "New",
  ].includes(value);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[7px] font-extrabold",
        good
          ? "bg-[#e7f6ec] text-[#238150]"
          : warning
            ? "bg-[#fff5df] text-[#9b6a1f]"
            : "bg-[#fff0ee] text-[#c9544d]",
      )}
    >
      {value}
    </span>
  );
}

export function DataFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f5f6f9] p-3">
      <span className="text-[7px] text-[#7c879d]">{label}</span>
      <b className="mt-1 block text-[9px]">{value}</b>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-[8px] font-extrabold">
      {label}
      {children}
    </label>
  );
}

export function OpsModal({
  icon: Icon,
  eyebrow,
  title,
  onClose,
  children,
  danger = false,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-[#080d1b]/75 p-4 backdrop-blur-sm">
      <section className="my-6 w-full max-w-2xl rounded-[26px] bg-white p-6 text-[#131827] shadow-2xl">
        <div className="flex items-start">
          <span
            className={cn(
              "grid size-12 place-items-center rounded-2xl",
              danger
                ? "bg-[#fff0ee] text-[#c9544d]"
                : "bg-[#edf1fb] text-[#536fdf]",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="ml-4">
            <p className="text-[7px] font-extrabold tracking-[.18em] text-[#7c879d] uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-black">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
