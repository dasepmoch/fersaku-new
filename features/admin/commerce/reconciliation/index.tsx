"use client";

import { adminPanel } from "@/features/admin/ui";

import { useState } from "react";
import {
  AlertOctagon,
  CircleDollarSign,
  FileSearch,
  Landmark,
  RefreshCcw,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { discrepancySeed } from "./data";
import { ReconciliationInspectDialog } from "./inspect-dialog";
import { OpsMetric, Status } from "./pieces";

export function ReconciliationCenter() {
  const [items, setItems] = useState(discrepancySeed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const selected = items.find((item) => item.id === selectedId);
  const { pageRows, pagination } = useClientPagination(items);
  const resolve = () => {
    if (!selected) return;
    setItems((rows) =>
      rows.map((row) =>
        row.id === selected.id
          ? { ...row, status: "Resolved", difference: "Rp0" }
          : row,
      ),
    );
    setSelectedId(null);
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpsMetric
          icon={Landmark}
          label="Provider settlement"
          value="Rp1,284M"
          note="12 Jul 2026"
          tone="success"
        />
        <OpsMetric
          icon={CircleDollarSign}
          label="Internal paid ledger"
          value="Rp1,279M"
          note="Before open mismatches"
        />
        <OpsMetric
          icon={AlertOctagon}
          label="Open discrepancy"
          value="3"
          note="Rp5,129jt exposure"
          tone="danger"
        />
        <OpsMetric
          icon={Scale}
          label="Reconciliation rate"
          value="99,96%"
          note="Target 100%"
          tone="warning"
        />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-4 border-b border-[#e5e8ef] p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-black">
              Payment reconciliation & ledger check
            </h2>
            <p className="mt-1 text-[8px] text-[#7c879d]">
              Duitku/Xendit settlement versus payment, order, seller balance,
              and double-entry ledger.
            </p>
          </div>
          <button
            onClick={() => {
              setRunning(true);
              setTimeout(() => setRunning(false), 1300);
            }}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#11182a] px-4 text-[8px] font-extrabold text-white sm:ml-auto"
          >
            {running ? (
              <RefreshCcw className="size-3.5 animate-spin" />
            ) : (
              <Scale className="size-3.5" />
            )}
            {running ? "Reconciling..." : "Run reconciliation"}
          </button>
        </div>
        <div className="grid gap-px bg-[#e5e8ef] sm:grid-cols-4">
          {[
            ["Provider gross", "Rp1.284.129.000"],
            ["Internal captured", "Rp1.279.000.000"],
            ["Seller credits", "Rp1.240.630.000"],
            ["Fees + unresolved", "Rp43.499.000"],
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-5">
              <span className="text-[7px] font-extrabold text-[#7c879d] uppercase">
                {label}
              </span>
              <b className="mt-2 block text-sm">{value}</b>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#7c879d] uppercase">
              <tr>
                {[
                  "Case",
                  "Provider ref",
                  "Order/Payout",
                  "Provider",
                  "Internal",
                  "Amount",
                  "Difference",
                  "Age",
                  "Status",
                  "",
                ].map((label) => (
                  <th key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-[#e8eaf0] text-[8px]"
                >
                  <td className="px-4 py-4 font-mono font-bold text-[#536fdf]">
                    {item.id}
                  </td>
                  <td className="font-mono">{item.providerRef}</td>
                  <td className="font-mono font-bold">{item.order}</td>
                  <td>
                    <Status value={item.provider} />
                  </td>
                  <td>
                    <Status value={item.internal} />
                  </td>
                  <td className="font-bold">{item.amount}</td>
                  <td
                    className={
                      item.difference === "Rp0"
                        ? "text-[#238150]"
                        : "font-extrabold text-[#c9544d]"
                    }
                  >
                    {item.difference}
                  </td>
                  <td>{item.age}</td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>
                    <button
                      onClick={() => setSelectedId(item.id)}
                      className="flex items-center gap-1 font-extrabold text-[#536fdf]"
                    >
                      <FileSearch className="size-3.5" /> Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
      <section className={`${adminPanel} mt-4 p-5`}>
        <div className="flex items-center">
          <ShieldCheck className="size-4 text-[#238150]" />
          <div className="ml-3">
            <b className="block text-[9px]">Double-entry invariant</b>
            <span className="text-[8px] text-[#7c879d]">
              Assets = seller liabilities + platform revenue + provider fees +
              unresolved suspense.
            </span>
          </div>
          <span className="ml-auto rounded-full bg-[#e7f6ec] px-3 py-1.5 text-[8px] font-extrabold text-[#238150]">
            BALANCED AFTER SUSPENSE
          </span>
        </div>
      </section>
      {selected && (
        <ReconciliationInspectDialog
          selected={selected}
          onClose={() => setSelectedId(null)}
          resolve={resolve}
        />
      )}
    </>
  );
}
