"use client";

import {
  adminPanel,
  Metric,
  TableToolbar,
  TableHeader,
  AdminStatus,
  TransactionSourceBadge,
  TransactionSourceFilter,
  type AdminTransactionSourceFilter,
} from "@/features/admin/ui";

import { MoreHorizontal } from "lucide-react";

import { rupiah } from "@/lib/utils";

import { useAdminPayments } from "@/features/admin/data";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { PaymentMismatchAlert } from "@/features/admin/operations/payment-mismatch";

import { useState } from "react";

function Payments() {
  const { data, refetch, isFetching } = useAdminPayments();
  const paymentIntents = data ?? [];
  const [sourceFilter, setSourceFilter] =
    useState<AdminTransactionSourceFilter>("ALL");
  const filteredIntents =
    sourceFilter === "ALL"
      ? paymentIntents
      : paymentIntents.filter((intent) => intent.source === sourceFilter);
  const { pageRows, pagination } = useClientPagination(filteredIntents);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="QRIS created" value="2,104" note="Today" />
        <Metric label="Success rate" value="96.84%" note="+0.42%" />
        <Metric label="Provider latency" value="142ms" note="p50 response" />
        <Metric label="Failed callbacks" value="3" note="0.14% today" />
      </div>
      <PaymentMismatchAlert />
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#e6e9ef] p-4 sm:flex-row">
          <TableToolbar
            inline
            placeholder="Search intent or provider reference..."
          />
          <div className="flex items-center gap-2 border-t border-[#e6e9ef] px-4 py-3 sm:border-t-0 sm:py-0">
            <TransactionSourceFilter
              value={sourceFilter}
              onChange={setSourceFilter}
            />
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-xl border border-[#dce1eb] bg-white px-3 text-[9px] font-bold"
            >
              {isFetching ? "Refreshing" : "Refresh status"}
            </button>
            <button
              type="button"
              disabled
              title="Create test payments from the merchant sandbox API playground"
              className="rounded-xl bg-[#11182a] px-3 text-[9px] font-bold text-white"
            >
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
                "Source",
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
                  <td>
                    <TransactionSourceBadge source={p.source} />
                  </td>
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
        <section className={`${adminPanel} p-5`}>
          <h3 className="text-xs font-black">Xendit callback traffic</h3>
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
        <section className={`${adminPanel} p-5`}>
          <h3 className="text-xs font-black">Xendit account snapshot</h3>
          <div className="mt-5 grid gap-3">
            {[
              ["Successful payments", "2.038"],
              ["Pending payments", "63"],
              ["Failed payments", "3"],
              ["Last provider sync", "12 Jul 2026, 14:35"],
            ].map((x, i) => (
              <div
                key={x[0]}
                className={`flex justify-between rounded-xl p-3 text-[9px] ${i === 0 ? "bg-[#eaf8ef] text-[#277c4c]" : "bg-[#f5f6f9]"}`}
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

export { Payments as AdminPaymentsScreen };
