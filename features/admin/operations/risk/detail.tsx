"use client";

import { FileSearch, LockKeyhole } from "lucide-react";
import type { RiskAlert } from "./data";
import { RiskScore } from "./pieces";

export function RiskCaseDetail({
  selected,
  updateStatus,
}: {
  selected: RiskAlert;
  updateStatus: (status: string) => void;
}) {
  return (
    <aside className="p-5">
      <div className="flex items-start">
        <div>
          <p className="font-mono text-[8px] font-bold text-[#536fdf]">
            {selected.id}
          </p>
          <h3 className="mt-1 text-sm font-black">{selected.type}</h3>
        </div>
        <RiskScore score={selected.score} />
      </div>
      <p className="mt-4 text-[10px] leading-5 font-extrabold">
        {selected.signal}
      </p>
      <div className="mt-5 rounded-2xl bg-[#f6f7fa] p-4">
        <p className="text-[8px] font-extrabold tracking-wider text-[#7c879d] uppercase">
          Evidence bundle
        </p>
        <div className="mt-3 grid gap-2">
          {selected.evidence.map((item) => (
            <div key={item} className="flex gap-2 text-[8px] leading-4">
              <FileSearch className="mt-0.5 size-3.5 shrink-0 text-[#5b7cfa]" />
              {item}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-[#f0d69e] bg-[#fff8e8] p-4 text-[8px] leading-4 text-[#7c6a45]">
        <LockKeyhole className="mr-2 inline size-3.5" />
        {selected.action}
      </div>
      <label className="mt-4 grid gap-2 text-[8px] font-extrabold">
        Investigator note
        <textarea
          rows={3}
          defaultValue="Review device graph, KYC documents, and provider settlement evidence before releasing funds."
          className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[9px] font-normal outline-none"
        />
      </label>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => updateStatus("Investigating")}
          className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-extrabold"
        >
          Assign to me
        </button>
        <button
          onClick={() => updateStatus("Escalated")}
          className="h-10 rounded-xl bg-[#11182a] text-[8px] font-extrabold text-white"
        >
          Escalate case
        </button>
        <button
          onClick={() => updateStatus("Released")}
          className="h-10 rounded-xl border border-[#b9dec8] bg-[#eff9f2] text-[8px] font-extrabold text-[#277a4b]"
        >
          Release hold
        </button>
        <button
          onClick={() => updateStatus("Restricted")}
          className="h-10 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white"
        >
          Restrict merchant
        </button>
      </div>
      <p className="mt-3 text-[7px] leading-4 text-[#8a94a7]">
        All decisions append actor, reason, evidence snapshot, previous state,
        and policy version to the immutable audit trail.
      </p>
    </aside>
  );
}
