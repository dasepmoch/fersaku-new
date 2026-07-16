"use client";

import { CircleDot, Copy, Eye, EyeOff } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export function StatusChip({
  icon: Icon,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[7px] font-bold text-white/75">
      <Icon className="size-3" />
      {text}
    </span>
  );
}

export function BadgeIcon({ className }: { className?: string }) {
  return <CircleDot className={className} />;
}

export function Credential({
  label,
  value,
  shown,
  action,
}: {
  label: string;
  value: string;
  shown: boolean;
  action?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#e2e6ed] p-4">
      <span className="text-[7px] font-extrabold tracking-wider text-[#8490a5] uppercase">
        {label}
      </span>
      <div className="mt-3 flex items-center">
        <code className="min-w-0 flex-1 truncate text-[9px] font-bold">
          {value}
        </code>
        {action && (
          <button
            onClick={action}
            className="ml-2 grid size-8 place-items-center rounded-lg border border-[#dce1e9]"
          >
            {shown ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </button>
        )}
        <button className="ml-1 grid size-8 place-items-center rounded-lg border border-[#dce1e9]">
          <Copy className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function RoutingCard({
  title,
  value,
  note,
  active,
}: {
  title: string;
  value: string;
  note: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e2e6ed] p-4">
      <div className="flex items-center">
        <b className="text-[8px]">{title}</b>
        <span
          className={cn(
            "ml-auto size-2 rounded-full",
            active ? "bg-[#25a85a]" : "bg-[#cbd2de]",
          )}
        />
      </div>
      <p className="mt-3 text-[10px] font-black">{value}</p>
      <span className="mt-1 block text-[7px] text-[#7c879d]">{note}</span>
    </div>
  );
}

export function Limit({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2 text-[7px] font-bold text-[#7c879d]">
      {label}
      <input
        defaultValue={value}
        className="h-10 rounded-xl border border-[#dce1e9] px-3 text-[9px] font-bold text-[#131827]"
      />
    </label>
  );
}
