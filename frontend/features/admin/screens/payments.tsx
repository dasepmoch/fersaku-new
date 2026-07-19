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

import { useAdminPaymentMismatches, useAdminPayments } from "@/features/admin/data";
import { getDomainSource } from "@/shared/data/domain-source";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { PaymentMismatchAlert } from "@/features/admin/operations/payment-mismatch";

import { useMemo, useState } from "react";

function Payments() {
  const isMock = getDomainSource("adminRead") === "mock";
  const [sourceFilter, setSourceFilter] =
    useState<AdminTransactionSourceFilter>("ALL");

  // Server source filter on API path (BE rejects MIXED).
  const listFilters = useMemo(() => {
    if (sourceFilter === "ALL") return {};
    if (sourceFilter === "MIXED") return { source: "MIXED" as const };
    return { source: sourceFilter };
  }, [sourceFilter]);

  const { data, refetch, isFetching } = useAdminPayments(listFilters);
  const { data: mismatches } = useAdminPaymentMismatches();
  const paymentIntents = data ?? [];

  // Client filter only on mock when ALL; API path already filtered by source.
  const filteredIntents =
    isMock && sourceFilter !== "ALL"
      ? sourceFilter === "MIXED"
        ? []
        : paymentIntents.filter((intent) => intent.source === sourceFilter)
      : paymentIntents;

  const { pageRows, pagination } = useClientPagination(filteredIntents);

  const successCount = paymentIntents.filter((p) =>
    /success|paid|settled/i.test(p.status),
  ).length;
  const failedCount = paymentIntents.filter((p) =>
    /fail|reject|unknown/i.test(p.status),
  ).length;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="QRIS created"
          value={
            isMock
              ? "2,104"
              : paymentIntents.length.toLocaleString("id-ID") || "—"
          }
          note={isMock ? "Today" : "Current page"}
        />
        <Metric
          label="Success rate"
          value={
            isMock
              ? "96.84%"
              : paymentIntents.length
                ? `${((successCount / paymentIntents.length) * 100).toFixed(2)}%`
                : "—"
          }
          note={isMock ? "+0.42%" : "Listed intents"}
        />
        <Metric
          label="Provider latency"
          value={isMock ? "142ms" : "—"}
          note={isMock ? "p50 response" : "Server health in providers"}
        />
        <Metric
          label="Failed callbacks"
          value={isMock ? "3" : String(failedCount)}
          note={isMock ? "0.14% today" : "Failed / unknown on page"}
        />
      </div>
      <PaymentMismatchAlert mismatches={mismatches ?? (isMock ? undefined : [])} />
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
            {(isMock
              ? [
                  32, 58, 40, 75, 62, 80, 54, 89, 68, 92, 73, 100, 86, 94, 72, 88,
                  66, 81, 59, 77,
                ]
              : Array.from({ length: 20 }, () => 12)
            ).map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-sm bg-[#5b7cfa]"
                style={{
                  height: `${h}%`,
                  opacity: isMock ? 0.25 + i / 29 : 0.15,
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-between text-[8px] text-[#8c96a8]">
            <span>
              {isMock
                ? "2,089 verified"
                : `${successCount} paid on page`}
            </span>
            <span className="text-[#d85b53]">
              {isMock
                ? "3 rejected signatures"
                : `${failedCount} failed / unknown`}
            </span>
          </div>
        </section>
        <section className={`${adminPanel} p-5`}>
          <h3 className="text-xs font-black">Xendit account snapshot</h3>
          <div className="mt-5 grid gap-3">
            {(isMock
              ? [
                  ["Successful payments", "2.038"],
                  ["Pending payments", "63"],
                  ["Failed payments", "3"],
                  ["Last provider sync", "12 Jul 2026, 14:35"],
                ]
              : [
                  ["Successful payments", String(successCount)],
                  [
                    "Pending payments",
                    String(
                      paymentIntents.filter((p) =>
                        /pending/i.test(p.status),
                      ).length,
                    ),
                  ],
                  ["Failed payments", String(failedCount)],
                  [
                    "Mismatches open",
                    String((mismatches ?? []).length),
                  ],
                ]
            ).map((x, i) => (
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
