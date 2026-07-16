"use client";

import { adminPanel } from "@/features/admin/ui";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Policy({
  label,
  defaultEnabled,
}: {
  label: string;
  defaultEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  return (
    <div className={`${adminPanel} flex items-center p-4`}>
      <span className="grid size-9 place-items-center rounded-xl bg-[#eef1ff] text-[#536fdf]">
        <ShieldCheck className="size-4" />
      </span>
      <div className="ml-3">
        <b className="block text-[8px]">{label}</b>
        <span className="text-[7px] text-[#707a90]">
          Changes require reason and create an immutable audit event.
        </span>
      </div>
      <button
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "relative ml-auto h-6 w-11 rounded-full",
          enabled ? "bg-[#536fdf]" : "bg-[#cbd2de]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-4 rounded-full bg-white transition",
            enabled ? "left-6" : "left-1",
          )}
        />
      </button>
    </div>
  );
}
