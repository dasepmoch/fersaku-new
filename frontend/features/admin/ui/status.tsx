"use client";

import { isPendingStatus, isPositiveStatus } from "@/shared/format/status";

export function AdminStatus({ status }: { status: string }) {
  const positive = isPositiveStatus(status);
  const pending = isPendingStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[8px] font-extrabold whitespace-nowrap ${positive ? "bg-[#e9f7ef] text-[#287d4c]" : pending ? "bg-[#fff6e4] text-[#a16d1e]" : "bg-[#fff0ee] text-[#c9544d]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const low = risk === "Low";
  const high = ["High", "Critical"].includes(risk);
  return (
    <span
      className={`rounded-lg px-2 py-1 text-[8px] font-extrabold ${low ? "bg-[#e9f7ef] text-[#287d4c]" : high ? "bg-[#fff0ee] text-[#c9544d]" : "bg-[#fff6e4] text-[#9b6a1f]"}`}
    >
      {risk}
    </span>
  );
}

export function Info({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div>
      <h3 className="mb-4 text-[9px] font-black tracking-[.1em] text-[#778297] uppercase">
        {title}
      </h3>
      <div className="grid gap-3">
        {rows.map((r) => (
          <div key={r[0]} className="flex justify-between gap-4 text-[9px]">
            <span className="text-[#818ca1]">{r[0]}</span>
            <b className="text-right">{r[1]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
