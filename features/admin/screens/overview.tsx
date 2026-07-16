"use client";

import { adminPanel, PanelHead } from "@/features/admin/ui";

import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ShieldAlert,
  Store,
  TrendingUp,
  Webhook,
} from "lucide-react";
import {
  useAdminAuditEvents,
  useAdminPlatformVolume,
} from "@/features/admin/data";
import { RotatingQuote } from "@/components/rotating-quote";

function CommandCenter() {
  const { data: platformVolume } = useAdminPlatformVolume();
  const { data: auditEvents } = useAdminAuditEvents();
  const metrics = [
    [
      "Gross volume",
      "Rp84,2jt",
      "+18.4%",
      CircleDollarSign,
      "#eaf0ff",
      "#5b7cfa",
    ],
    [
      "Net platform revenue",
      "Rp3,18jt",
      "+12.8%",
      TrendingUp,
      "#e8f8ef",
      "#26965a",
    ],
    ["Payment success", "96,84%", "+0.42%", CheckCircle2, "#e8f8ef", "#26965a"],
    [
      "Risk exposure",
      "Rp6,3jt",
      "4 open cases",
      ShieldAlert,
      "#fff1ee",
      "#e46058",
    ],
  ];
  return (
    <>
      <RotatingQuote surface="admin" compact className="mb-4" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, note, Icon, bg, color]) => (
          <div key={label as string} className={`${adminPanel} p-5`}>
            <div className="flex items-start justify-between">
              <span
                className="grid size-10 place-items-center rounded-xl"
                style={{ background: bg as string, color: color as string }}
              >
                <Icon className="size-4.5" />
              </span>
              <span className="rounded-full bg-[#f1f3f7] px-2 py-1 text-[8px] font-bold text-[#6f7a90]">
                LIVE
              </span>
            </div>
            <p className="mt-5 text-[9px] font-extrabold tracking-[.12em] text-[#7c879d] uppercase">
              {label as string}
            </p>
            <div className="mt-1 flex items-end justify-between">
              <b className="text-2xl tracking-[-.04em]">{value as string}</b>
              <span
                className="text-[9px] font-extrabold"
                style={{ color: color as string }}
              >
                {note as string}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
        <section className={`${adminPanel} p-5 sm:p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-black">Platform payment volume</h2>
              <p className="mt-1 text-[9px] text-[#8490a5]">
                Hourly gross merchandise volume • IDR
              </p>
            </div>
            <div className="flex gap-1 rounded-lg bg-[#f1f3f7] p-1">
              {["24H", "7D", "30D"].map((x, i) => (
                <button
                  key={x}
                  className={`rounded-md px-2.5 py-1.5 text-[8px] font-extrabold ${i === 0 ? "bg-white text-[#11182a] shadow-sm" : "text-[#7f899e]"}`}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 flex h-52 items-end gap-1.5">
            {(platformVolume ?? []).map((h, i) => (
              <div
                key={i}
                className="group relative flex-1 rounded-t-sm bg-[#5b7cfa] transition hover:bg-[#375eea]"
                style={{ height: `${h / 1.35}%`, opacity: 0.26 + i / 36 }}
              >
                <span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-[#11182a] px-2 py-1 text-[7px] text-white group-hover:block">
                  {h * 18}k
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[8px] font-bold text-[#9099aa]">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>Now</span>
          </div>
        </section>
        <section className={`${adminPanel} overflow-hidden`}>
          <div className="border-b border-[#e3e6ed] p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-black">System health</h2>
                <p className="mt-1 text-[9px] text-[#8490a5]">
                  Provider and infrastructure status
                </p>
              </div>
              <Activity className="size-4 text-[#2fa865]" />
            </div>
          </div>
          <div className="p-5">
            {[
              ["Duitku QRIS", "Operational", "142ms"],
              ["Xendit Disbursement", "Operational", "218ms"],
              ["PostgreSQL", "Operational", "12ms"],
              ["Redis & queues", "Degraded", "386ms"],
              ["R2 storage", "Operational", "86ms"],
            ].map(([name, status, latency]) => (
              <div key={name} className="mb-4 flex items-center last:mb-0">
                <span
                  className={`mr-3 size-2 rounded-full ${status === "Operational" ? "bg-[#2fa865]" : "animate-pulse bg-[#efa343]"}`}
                />
                <div>
                  <p className="text-[10px] font-extrabold">{name}</p>
                  <p className="text-[8px] text-[#8b95a8]">{status}</p>
                </div>
                <span className="ml-auto font-mono text-[8px] text-[#7d879b]">
                  {latency}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className={`${adminPanel} overflow-hidden`}>
          <PanelHead
            title="Action queue"
            desc="Items requiring administrator attention"
            action={
              <Link
                href="/admin/risk"
                className="text-[9px] font-extrabold text-[#5b7cfa]"
              >
                View all
              </Link>
            }
          />
          <div>
            {[
              [
                AlertOctagon,
                "Critical risk case",
                "Crypto Signals Pro",
                "12 min",
                "critical",
              ],
              [
                Banknote,
                "Withdrawal review",
                "Rp25.000.000 • Kelas Growth ID",
                "32 min",
                "warning",
              ],
              [
                Webhook,
                "Webhook delivery spike",
                "14 failed deliveries in 10 min",
                "48 min",
                "warning",
              ],
              [
                Store,
                "Merchant verification",
                "3 merchants awaiting review",
                "2 h",
                "normal",
              ],
            ].map(([Icon, title, sub, age, tone]) => (
              <div
                key={title as string}
                className="flex items-center gap-3 border-t border-[#e7e9ef] px-5 py-4"
              >
                <span
                  className={`grid size-9 place-items-center rounded-xl ${tone === "critical" ? "bg-[#fff0ee] text-[#df564e]" : tone === "warning" ? "bg-[#fff6e4] text-[#d68a23]" : "bg-[#eef2ff] text-[#5b7cfa]"}`}
                >
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-[10px] font-extrabold">
                    {title as string}
                  </p>
                  <p className="mt-1 text-[8px] text-[#818ca1]">
                    {sub as string}
                  </p>
                </div>
                <span className="ml-auto text-[8px] font-bold text-[#929bad]">
                  {age as string}
                </span>
                <ChevronRight className="size-3.5 text-[#a0a8b7]" />
              </div>
            ))}
          </div>
        </section>
        <section className={`${adminPanel} overflow-hidden`}>
          <PanelHead
            title="Live audit stream"
            desc="Sensitive platform activity"
          />
          <div>
            {(auditEvents ?? []).slice(0, 4).map((e) => (
              <div
                key={e.id}
                className="flex gap-3 border-t border-[#e7e9ef] px-5 py-3.5"
              >
                <span className="mt-1 size-2 shrink-0 rounded-full bg-[#5b7cfa]" />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[9px] font-bold">
                    {e.action}
                  </p>
                  <p className="mt-1 truncate text-[8px] text-[#8993a6]">
                    {e.actor} → {e.target}
                  </p>
                </div>
                <span className="ml-auto text-[8px] whitespace-nowrap text-[#929bad]">
                  {e.time}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export { CommandCenter as AdminOverviewScreen };
