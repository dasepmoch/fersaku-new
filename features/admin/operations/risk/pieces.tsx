"use client";

import { adminPanel } from "@/features/admin/ui";

import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminMetric({
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
  const colors =
    tone === "danger"
      ? "bg-[#fff0ee] text-[#c9544d]"
      : tone === "warning"
        ? "bg-[#fff5df] text-[#ad741f]"
        : tone === "success"
          ? "bg-[#e7f6ec] text-[#238150]"
          : "bg-[#edf1fb] text-[#536fdf]";
  return (
    <div className={`${adminPanel} p-5`}>
      <div className="flex items-start">
        <span
          className={cn("grid size-10 place-items-center rounded-xl", colors)}
        >
          <Icon className="size-4" />
        </span>
        <ArrowRight className="ml-auto size-4 text-[#a0a8b7]" />
      </div>
      <p className="mt-5 text-[8px] font-extrabold tracking-[.12em] text-[#7c879d] uppercase">
        {label}
      </p>
      <b className="mt-1 block text-xl tracking-[-.04em]">{value}</b>
      <span className="mt-1 block text-[8px] text-[#7c879d]">{note}</span>
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const positive = [
    "200",
    "PAID",
    "COMPLETED",
    "Completed",
    "Fulfilled",
    "Released",
    "Approved",
  ].includes(value);
  const warning = [
    "Pending",
    "Timeout",
    "Manual",
    "Investigating",
    "Monitoring",
    "Open",
  ].includes(value);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[7px] font-extrabold",
        positive
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

export function RiskScore({ score }: { score: number }) {
  return (
    <div className="ml-auto text-right">
      <p className="text-[7px] font-extrabold text-[#7c879d] uppercase">
        Risk score
      </p>
      <b className="mt-1 block text-2xl text-[#d95750]">{score}</b>
    </div>
  );
}
