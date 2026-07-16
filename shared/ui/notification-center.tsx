"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notificationData, type Surface } from "./account-controls-data";

export function NotificationCenter({ surface }: { surface: Surface }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const items = notificationData[surface];
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        data-feedback="off"
        onClick={() => setOpen(!open)}
        className="hairline relative grid size-10 place-items-center rounded-xl border bg-white"
        aria-label="Buka notifikasi"
      >
        <Bell className="size-4" />
        {read.size < items.length && (
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-[#ff794d]" />
        )}
      </button>
      {open && (
        <div
          className={`shadow-float absolute top-12 right-0 z-[120] w-[340px] overflow-hidden rounded-2xl border ${surface === "admin" ? "border-[#28334e] bg-[#11182a] text-white" : "hairline bg-[#fbfaf6]"}`}
        >
          <div className="hairline flex items-center border-b p-4">
            <div>
              <b className="block text-xs">Notifikasi</b>
              <span className="text-[8px] opacity-55">
                {items.length - read.size} belum dibaca
              </span>
            </div>
            <button
              data-feedback="off"
              onClick={() => setRead(new Set(items.map((i) => i.id)))}
              className="ml-auto text-[8px] font-extrabold text-[#5b7cfa]"
            >
              Tandai semua dibaca
            </button>
          </div>
          <div>
            {items.map((item) => {
              const Icon = item.icon;
              const isRead = read.has(item.id);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    setRead(new Set([...read, item.id]));
                    setOpen(false);
                  }}
                  className={`hairline flex gap-3 border-b p-4 transition hover:bg-black/[.03] ${isRead ? "opacity-55" : ""}`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${surface === "admin" ? "bg-[#202b48] text-[#809bff]" : "bg-[#e9ff9b] text-[#173f2c]"}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <b className="block text-[9px]">{item.title}</b>
                    <p className="mt-1 text-[8px] leading-4 opacity-60">
                      {item.body}
                    </p>
                    <span className="mt-1 block text-[7px] opacity-40">
                      {item.time}
                    </span>
                  </div>
                  {!isRead && (
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#5b7cfa]" />
                  )}
                </Link>
              );
            })}
          </div>
          <Link
            href={surface === "admin" ? "/admin/system" : "/dashboard/settings"}
            onClick={() => setOpen(false)}
            className="block p-3 text-center text-[8px] font-extrabold opacity-60"
          >
            Atur preferensi notifikasi
          </Link>
        </div>
      )}
    </div>
  );
}
