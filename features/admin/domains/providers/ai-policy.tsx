"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function AiPolicy({
  label,
  defaultActive,
}: {
  label: string;
  defaultActive: boolean;
}) {
  const [active, setActive] = useState(defaultActive);
  return (
    <div className="flex items-center rounded-xl border border-[#e2e6ed] p-4">
      <ShieldCheck className="size-4 text-[#c84065]" />
      <b className="ml-3 text-[8px]">{label}</b>
      <button
        onClick={() => setActive(!active)}
        className={cn(
          "relative ml-auto h-5 w-9 rounded-full",
          active ? "bg-[#c84065]" : "bg-[#cbd2de]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-3 rounded-full bg-white transition",
            active ? "left-5" : "left-1",
          )}
        />
      </button>
    </div>
  );
}
