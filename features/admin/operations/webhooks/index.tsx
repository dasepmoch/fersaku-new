"use client";

import { adminPanel } from "@/features/admin/ui";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCcw,
  RotateCcw,
  Search,
  Webhook,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { initialWebhooks } from "./data";
import { ForceFulfillDialog } from "./force-fulfill-dialog";
import { AdminMetric, StatusPill } from "./pieces";

export function WebhookOperations() {
  const [rows, setRows] = useState(initialWebhooks);
  const [selectedId, setSelectedId] = useState(initialWebhooks[0].id);
  const [forceOpen, setForceOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const selected = rows.find((row) => row.id === selectedId) || rows[0];
  const { pageRows, pagination } = useClientPagination(rows);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          icon={Webhook}
          label="Events today"
          value="18.492"
          note="3 provider sources"
        />
        <AdminMetric
          icon={CheckCircle2}
          label="Success rate"
          value="99,72%"
          note="+0,08%"
          tone="success"
        />
        <AdminMetric
          icon={AlertTriangle}
          label="Order mismatches"
          value="2"
          note="Provider paid, order pending"
          tone="danger"
        />
        <AdminMetric
          icon={Clock3}
          label="Median latency"
          value="92 ms"
          note="p95 840 ms"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className={`${adminPanel} min-w-0 overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row sm:items-center">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe3ec] px-3 text-[#7c879d]">
              <Search className="size-4" />
              <input
                placeholder="Search delivery, order, provider..."
                className="min-w-0 flex-1 text-[9px] outline-none"
              />
            </label>
            <select className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[9px] font-bold">
              <option>All providers</option>
              <option>Duitku</option>
              <option>Xendit</option>
              <option>Seller</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#8490a5] uppercase">
                <tr>
                  {[
                    "Delivery",
                    "Source",
                    "Event",
                    "Order",
                    "HTTP",
                    "Provider",
                    "Local state",
                    "Attempts",
                    "Age",
                    "",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "cursor-pointer border-t border-[#e8eaf0] text-[8px]",
                      selectedId === row.id && "bg-[#f1f4ff]",
                    )}
                  >
                    <td className="px-4 py-4 font-mono font-bold text-[#536fdf]">
                      {row.id}
                    </td>
                    <td className="font-bold">{row.source}</td>
                    <td className="font-mono">{row.event}</td>
                    <td className="font-mono">{row.order}</td>
                    <td>
                      <StatusPill value={row.http} />
                    </td>
                    <td>
                      <StatusPill value={row.providerStatus} />
                    </td>
                    <td>
                      <StatusPill value={row.orderStatus} />
                    </td>
                    <td>{row.attempts}</td>
                    <td>{row.age}</td>
                    <td>
                      <Eye className="size-3.5 text-[#536fdf]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination} />
        </section>

        <aside className={`${adminPanel} overflow-hidden`}>
          <div className="border-b border-[#e5e8ef] bg-[#11182a] p-5 text-white">
            <p className="font-mono text-[8px] text-[#91a2d2]">{selected.id}</p>
            <h3 className="mt-2 text-sm font-black">{selected.event}</h3>
            <p className="mt-1 text-[8px] text-white/45">
              {selected.source} - order {selected.order}
            </p>
          </div>
          <div className="p-5">
            {selected.providerStatus === "PAID" &&
              selected.orderStatus === "Pending" && (
                <div className="rounded-2xl border border-[#f1c7c1] bg-[#fff0ee] p-4 text-[8px] leading-4 text-[#92443d]">
                  <AlertOctagon className="mr-2 inline size-4" />
                  Settlement mismatch: provider confirms paid while Fersaku
                  order remains pending.
                </div>
              )}
            <div className="mt-4 grid gap-3">
              {[
                ["Provider reference", "DKT-QRP-99281"],
                ["Signature validation", "Valid - HMAC SHA256"],
                ["Received at", "12 Jul 2026, 14:39:22.841"],
                ["Idempotency key", `evt:${selected.id}`],
                ["Raw payload", "Encrypted - retained 90 days"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 border-b border-[#edf0f4] pb-3 text-[8px]"
                >
                  <span className="text-[#7c879d]">{label}</span>
                  <b className="text-right font-mono">{value}</b>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#f5f6f9] p-4">
              <p className="text-[8px] font-extrabold tracking-wider text-[#7c879d] uppercase">
                Payload preview
              </p>
              <pre className="mt-3 overflow-x-auto text-[7px] leading-4 text-[#455064]">{`{\n  "merchantOrderId": "${selected.order}",\n  "resultCode": "00",\n  "amount": 129000,\n  "reference": "DKT-QRP-99281"\n}`}</pre>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setRetrying(true);
                  setTimeout(() => setRetrying(false), 900);
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#dce1e9] text-[8px] font-extrabold"
              >
                {retrying ? (
                  <RefreshCcw className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                {retrying ? "Retrying" : "Retry delivery"}
              </button>
              <button
                disabled={
                  !(
                    selected.providerStatus === "PAID" &&
                    selected.orderStatus === "Pending"
                  )
                }
                onClick={() => setForceOpen(true)}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#d95750] text-[8px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#b9bfca]"
              >
                <Zap className="size-3.5" /> Force-Fulfill
              </button>
            </div>
            <p className="mt-3 text-[7px] leading-4 text-[#8a94a7]">
              Force-Fulfill is available only for a verified
              paid-provider/local-pending mismatch and requires settlement
              evidence.
            </p>
          </div>
        </aside>
      </div>

      {forceOpen && (
        <ForceFulfillDialog
          row={selected}
          onClose={() => setForceOpen(false)}
          onComplete={() => {
            setRows((items) =>
              items.map((item) =>
                item.id === selected.id
                  ? { ...item, orderStatus: "Fulfilled", http: "Manual" }
                  : item,
              ),
            );
            setForceOpen(false);
          }}
        />
      )}
    </>
  );
}
