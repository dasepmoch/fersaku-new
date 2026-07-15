"use client";

import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  FileDown,
  Filter,
  LockKeyhole,
  Pause,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { withdrawalReviews } from "@/lib/admin-mock-data";
import { rupiah } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
function Withdrawals() {
  const { pageRows, pagination } = useClientPagination(withdrawalReviews);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="Awaiting review"
          value="9"
          note="Rp44,2jt total"
          tone="warning"
        />
        <Metric label="Processing" value="Rp18,5jt" note="Via Xendit" />
        <Metric label="Completed today" value="Rp92,4jt" note="32 payouts" />
        <Metric
          label="Failed"
          value="2"
          note="Rp4,8jt released"
          tone="danger"
        />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <TableToolbar placeholder="Search withdrawal, merchant, bank account..." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <TableHeader
              labels={[
                "Withdrawal",
                "Merchant",
                "Amount",
                "Destination",
                "Risk",
                "Status",
                "Requested",
                "",
              ]}
            />
            <tbody>
              {pageRows.map((w) => (
                <tr key={w.id} className="border-t border-[#e8eaf0] text-[9px]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/withdrawals/${w.id}`}
                      className="font-mono font-bold text-[#4c6fe5]"
                    >
                      {w.id}
                    </Link>
                  </td>
                  <td>
                    <b className="block">{w.merchant}</b>
                    <span className="text-[8px] text-[#8993a6]">{w.owner}</span>
                  </td>
                  <td className="font-extrabold">{rupiah(w.amount)}</td>
                  <td>
                    <b className="block">{w.bank}</b>
                    <span className="text-[8px] text-[#8993a6]">
                      {w.account}
                    </span>
                  </td>
                  <td>
                    <RiskBadge risk={w.risk} />
                  </td>
                  <td>
                    <AdminStatus status={w.status} />
                  </td>
                  <td>{w.requested}</td>
                  <td>
                    <ChevronRight className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
    </>
  );
}
function WithdrawalDetail({ id }: { id: string }) {
  const w = withdrawalReviews.find((x) => x.id === id) || withdrawalReviews[0];
  const [action, setAction] = useState<string | null>(null);
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className={`${panel} p-6`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold text-[#5b7cfa]">
                {w.id}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-.04em]">
                {rupiah(w.amount)}
              </h2>
              <p className="mt-1 text-[10px] text-[#7d879b]">
                Requested by {w.merchant} • {w.requested}
              </p>
            </div>
            <AdminStatus status={w.status} />
          </div>
          <div className="mt-7 rounded-2xl border border-[#e1e5ed] bg-[#f8f9fb] p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Info
                title="Destination bank"
                rows={[
                  ["Bank", w.bank],
                  ["Account holder", w.account],
                  ["Verification", "Name matched"],
                  ["Saved since", "21 Apr 2026"],
                ]}
              />
              <Info
                title="Balance snapshot"
                rows={[
                  ["Available before", rupiah(w.amount + 6240500)],
                  ["Withdrawal amount", rupiah(w.amount)],
                  ["Locked amount", rupiah(w.amount)],
                  ["Available after", rupiah(6240500)],
                ]}
              />
            </div>
          </div>
          <div className="mt-6">
            <h3 className="text-[10px] font-black">Automated checks</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ["Bank name matched", true],
                ["Balance sufficient", true],
                ["No active disputes", true],
                ["Sales velocity normal", w.risk === "Low"],
                ["Account age > 30 days", true],
                ["No sanctions match", true],
              ].map(([label, ok]) => (
                <div
                  key={label as string}
                  className={`flex items-center gap-2 rounded-xl p-3 text-[9px] font-bold ${ok ? "bg-[#eef8f2] text-[#2a7d4e]" : "bg-[#fff2ef] text-[#c4554d]"}`}
                >
                  {ok ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <AlertOctagon className="size-3.5" />
                  )}
                  {label as string}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-7 flex flex-col gap-2 border-t border-[#e3e6ed] pt-6 sm:flex-row">
            <button
              onClick={() => setAction("Approve withdrawal")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1d8b50] text-[10px] font-extrabold text-white"
            >
              <Check className="size-4" /> Approve & disburse
            </button>
            <button
              onClick={() => setAction("Place withdrawal on hold")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#eccd8b] bg-[#fff8e9] text-[10px] font-extrabold text-[#9a6b1d]"
            >
              <Pause className="size-4" /> Place on hold
            </button>
            <button
              onClick={() => setAction("Reject withdrawal")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#efc5c1] bg-[#fff5f4] text-[10px] font-extrabold text-[#c6534c]"
            >
              <X className="size-4" /> Reject
            </button>
          </div>
        </section>
        <section className={`${panel} overflow-hidden`}>
          <PanelHead
            title="Review context"
            desc="Signals supporting this decision"
          />
          <div className="p-5">
            <div className="rounded-2xl bg-[#edf8f2] p-4">
              <div className="flex items-center gap-2 text-[#287e4d]">
                <ShieldCheck className="size-4" />
                <b className="text-[10px]">Low automated risk</b>
              </div>
              <p className="mt-2 text-[8px] leading-4 text-[#5f7969]">
                Merchant has stable payment volume, verified bank ownership, and
                no recent account changes.
              </p>
            </div>
            <div className="mt-5 grid gap-4">
              {[
                ["Merchant lifetime", "116 days"],
                ["Paid volume", "Rp82.640.000"],
                ["Previous payouts", "8 completed"],
                ["Chargeback rate", "0.00%"],
                ["Last bank change", "Never"],
                ["Admin notes", "No notes"],
              ].map((x) => (
                <div
                  key={x[0]}
                  className="flex justify-between border-b border-[#edf0f4] pb-3 text-[9px]"
                >
                  <span className="text-[#7d879b]">{x[0]}</span>
                  <b>{x[1]}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      {action && (
        <ControlDialog
          title={action}
          onClose={() => setAction(null)}
          danger={action.includes("Reject")}
        />
      )}
    </>
  );
}
function PanelHead({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <div>
        <h2 className="text-xs font-black">{title}</h2>
        <p className="mt-1 text-[9px] text-[#8590a4]">{desc}</p>
      </div>
      {action}
    </div>
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
function RiskBadge({ risk }: { risk: string }) {
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
function Info({ title, rows }: { title: string; rows: string[][] }) {
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
function ControlDialog({
  title,
  onClose,
  danger = false,
}: {
  title: string;
  onClose: () => void;
  danger?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#080d1b]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-6 shadow-2xl">
        {done ? (
          <div className="py-8 text-center">
            <span
              className={`mx-auto grid size-14 place-items-center rounded-full ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#e9f7ef] text-[#287d4c]"}`}
            >
              <Check className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-black">Action recorded</h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              Mock operation completed and an immutable audit event was created.
            </p>
            <button
              onClick={onClose}
              className="mt-6 h-10 w-full rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start">
              <span
                className={`grid size-11 place-items-center rounded-xl ${danger ? "bg-[#fff0ee] text-[#d25850]" : "bg-[#edf1ff] text-[#5b7cfa]"}`}
              >
                {danger ? (
                  <AlertTriangle className="size-5" />
                ) : (
                  <LockKeyhole className="size-5" />
                )}
              </span>
              <button onClick={onClose} className="ml-auto">
                <X className="size-4" />
              </button>
            </div>
            <h3 className="mt-5 text-lg font-black tracking-[-.03em]">
              {title}
            </h3>
            <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
              This privileged operation will be attributed to your administrator
              account and stored in the audit trail.
            </p>
            <label className="mt-5 grid gap-2 text-[9px] font-extrabold">
              Reason for action
              <textarea
                rows={3}
                placeholder="Provide an operational reason..."
                className="resize-none rounded-xl border border-[#dce1e9] p-3 text-[10px] font-normal outline-none focus:border-[#5b7cfa]"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-[8px] text-[#737e93]">
              <input type="checkbox" /> I have reviewed the available evidence
              and understand the impact.
            </label>
            <div className="mt-6 flex gap-2">
              <button
                onClick={onClose}
                className="h-10 flex-1 rounded-xl border border-[#dce1e9] text-[9px] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => setDone(true)}
                className={`h-10 flex-1 rounded-xl text-[9px] font-extrabold text-white ${danger ? "bg-[#ce544d]" : "bg-[#11182a]"}`}
              >
                Confirm action
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export {
  Withdrawals as AdminWithdrawalsScreen,
  WithdrawalDetail as AdminWithdrawalDetailScreen,
};
