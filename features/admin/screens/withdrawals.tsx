"use client";

import {
  adminPanel,
  PanelHead,
  Metric,
  TableToolbar,
  TableHeader,
  AdminStatus,
  ControlDialog,
  RiskBadge,
  Info,
} from "@/features/admin/ui";

import Link from "next/link";
import {
  AlertOctagon,
  Check,
  CheckCircle2,
  ChevronRight,
  Pause,
  ShieldCheck,
  X,
} from "lucide-react";

import { useState } from "react";

import { rupiah } from "@/lib/utils";

import { useAdminWithdrawal, useAdminWithdrawals } from "@/features/admin/data";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

function Withdrawals() {
  const { data } = useAdminWithdrawals();
  const withdrawalReviews = data ?? [];
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
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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
  const { data: w } = useAdminWithdrawal(id);
  const [action, setAction] = useState<string | null>(null);
  if (!w) return null;
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className={`${adminPanel} p-6`}>
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
        <section className={`${adminPanel} overflow-hidden`}>
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

export {
  Withdrawals as AdminWithdrawalsScreen,
  WithdrawalDetail as AdminWithdrawalDetailScreen,
};
