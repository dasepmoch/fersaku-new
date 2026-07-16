"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AnnouncementPreview({
  kind,
  title,
  message,
  ctaLabel,
}: {
  kind: string;
  title: string;
  message: string;
  ctaLabel: string;
}) {
  const style =
    kind === "critical"
      ? "border-[#e65750] bg-[#fff0ee] text-[#8e3833]"
      : kind === "compliance"
        ? "border-[#8da0d6] bg-[#eef2ff] text-[#344b83]"
        : kind === "info"
          ? "border-[#9bb8ef] bg-[#edf4ff] text-[#365887]"
          : "border-[#e4c363] bg-[#fff8df] text-[#755b1b]";
  return (
    <div className={cn("mt-4 rounded-2xl border p-4", style)}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <b className="text-[9px]">{title || "Announcement title"}</b>
          <p className="mt-1 text-[8px] leading-4 opacity-80">
            {message || "Announcement message"}
          </p>
          {ctaLabel && (
            <button className="mt-3 rounded-lg [background-color:#11182a] bg-current px-3 py-2 text-[7px] font-extrabold text-white">
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
