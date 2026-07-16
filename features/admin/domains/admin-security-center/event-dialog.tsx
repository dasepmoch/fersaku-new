"use client";

import { Ban, X } from "lucide-react";

export function SecurityEventDialog({
  selected,
  onClose,
}: {
  selected: string[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#07101e]/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 text-[#131827] shadow-2xl">
        <div className="flex items-start">
          <div>
            <p className="text-[8px] font-extrabold tracking-[.16em] text-[#536fdf] uppercase">
              Security investigation
            </p>
            <h2 className="mt-2 text-lg font-black">{selected[1]}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6 grid gap-3">
          {selected.map((value, index) => (
            <div
              key={index}
              className="grid grid-cols-[100px_1fr] border-b border-[#e8eaf0] pb-3 text-[8px]"
            >
              <b className="text-[#707a90]">
                {
                  [
                    "Event",
                    "Signal",
                    "Actor",
                    "Context",
                    "Severity",
                    "Status",
                    "Age",
                  ][index]
                }
              </b>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="h-10 rounded-xl border border-[#dce1e9] text-[8px] font-bold">
            Mark reviewed
          </button>
          <button className="h-10 rounded-xl bg-[#b55039] text-[8px] font-extrabold text-white">
            <Ban className="mr-1 inline size-3.5" /> Block actor
          </button>
        </div>
      </div>
    </div>
  );
}
