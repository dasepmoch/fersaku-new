"use client";

import { FileDown, Filter, MoreHorizontal, Search } from "lucide-react";
import { paymentIntents } from "@/lib/admin-mock-data";
import { rupiah } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
function Payments() {
  const { pageRows, pagination } = useClientPagination(paymentIntents);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="QRIS created" value="2,104" note="Today" />
        <Metric label="Success rate" value="96.84%" note="+0.42%" />
        <Metric label="Provider latency" value="142ms" note="p50 response" />
        <Metric label="Reconciliation gap" value="Rp0" note="Fully matched" />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#e6e9ef] p-4 sm:flex-row">
          <TableToolbar
            inline
            placeholder="Search intent or provider reference..."
          />
          <div className="flex gap-2 sm:ml-auto">
            <button className="rounded-xl border border-[#dce1eb] bg-white px-3 text-[9px] font-bold">
              Reconcile now
            </button>
            <button className="rounded-xl bg-[#11182a] px-3 text-[9px] font-bold text-white">
              Create test intent
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <TableHeader
              labels={[
                "Payment intent",
                "Provider",
                "Merchant",
                "Amount",
                "Provider ref",
                "Status",
                "Latency",
                "Created",
                "",
              ]}
            />
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.id} className="border-t border-[#e8eaf0] text-[9px]">
                  <td className="px-5 py-4 font-mono font-bold text-[#496be3]">
                    {p.id}
                  </td>
                  <td>
                    <span className="rounded-lg bg-[#eef1f6] px-2 py-1 font-bold">
                      {p.provider}
                    </span>
                  </td>
                  <td className="font-bold">{p.merchant}</td>
                  <td className="font-extrabold">{rupiah(p.amount)}</td>
                  <td className="font-mono">{p.providerRef}</td>
                  <td>
                    <AdminStatus status={p.status} />
                  </td>
                  <td>{p.latency}</td>
                  <td>{p.created}</td>
                  <td>
                    <MoreHorizontal className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={`${panel} p-5`}>
          <h3 className="text-xs font-black">Duitku callback traffic</h3>
          <div className="mt-6 flex h-28 items-end gap-1">
            {[
              32, 58, 40, 75, 62, 80, 54, 89, 68, 92, 73, 100, 86, 94, 72, 88,
              66, 81, 59, 77,
            ].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-sm bg-[#5b7cfa]"
                style={{ height: `${h}%`, opacity: 0.25 + i / 29 }}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-between text-[8px] text-[#8c96a8]">
            <span>2,089 verified</span>
            <span className="text-[#d85b53]">3 rejected signatures</span>
          </div>
        </section>
        <section className={`${panel} p-5`}>
          <h3 className="text-xs font-black">Reconciliation status</h3>
          <div className="mt-5 grid gap-3">
            {[
              ["Internal paid total", "Rp82.940.000"],
              ["Duitku settlement total", "Rp82.940.000"],
              ["Difference", "Rp0"],
              ["Last reconciled", "12 Jul 2026, 14:35"],
            ].map((x, i) => (
              <div
                key={x[0]}
                className={`flex justify-between rounded-xl p-3 text-[9px] ${i === 2 ? "bg-[#eaf8ef] text-[#277c4c]" : "bg-[#f5f6f9]"}`}
              >
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className={`${panel} p-5`}>
      <p className="text-[8px] font-extrabold tracking-[.12em] text-[#818ca1] uppercase">
        {label}
      </p>
      <p className="mt-2 text-xl font-black tracking-[-.035em]">{value}</p>
      {note && (
        <p
          className={`mt-1 text-[8px] font-semibold ${tone === "danger" ? "text-[#d55850]" : tone === "warning" ? "text-[#d28a25]" : "text-[#788399]"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}
function TableToolbar({
  placeholder,
  inline = false,
}: {
  placeholder: string;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? "w-full max-w-md"
          : "flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row"
      }
    >
      <SearchInput placeholder={placeholder} />
      {!inline && (
        <div className="flex gap-2 sm:ml-auto">
          <SelectButton label="All statuses" />
          <button className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold">
            <Filter className="size-3.5" /> More filters
          </button>
          <button className="flex h-10 items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold">
            <FileDown className="size-3.5" /> Export
          </button>
        </div>
      )}
    </div>
  );
}
function SearchInput({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-[#dce1e9] bg-white px-3 text-[#8590a4]">
      <Search className="size-3.5" />
      <input
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[9px] outline-none"
      />
    </div>
  );
}
function SelectButton({ label }: { label: string }) {
  return (
    <button className="h-10 rounded-xl border border-[#dce1e9] bg-white px-3 text-[9px] font-bold whitespace-nowrap text-[#667188]">
      {label}
    </button>
  );
}
function TableHeader({ labels }: { labels: string[] }) {
  return (
    <thead>
      <tr className="bg-[#f7f8fa] text-[8px] font-extrabold tracking-[.1em] text-[#8490a5] uppercase">
        {labels.map((x, i) => (
          <th key={x + i} className={i === 0 ? "px-5 py-3" : "py-3 pr-5"}>
            {x}
          </th>
        ))}
      </tr>
    </thead>
  );
}
function AdminStatus({ status }: { status: string }) {
  const positive = [
    "Active",
    "Paid",
    "Completed",
    "Live",
    "Success",
    "Operational",
    "Delivered",
    "Available",
    "Sold",
    "Verified",
    "Fulfilled",
    "Published",
  ].includes(status);
  const pending = [
    "Pending",
    "Processing",
    "Invited",
    "On hold",
    "Review",
    "Reserved",
  ].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[8px] font-extrabold whitespace-nowrap ${positive ? "bg-[#e9f7ef] text-[#287d4c]" : pending ? "bg-[#fff6e4] text-[#a16d1e]" : "bg-[#fff0ee] text-[#c9544d]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export { Payments as AdminPaymentsScreen };
