"use client";

import { adminPanel } from "@/features/admin/ui";

import { useState } from "react";
import { Clock3, Gavel, LockKeyhole, RotateCcw, Search } from "lucide-react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { DisputeCaseDialog } from "./case-dialog";
import { disputeSeed } from "./data";
import { OpsMetric, Status } from "./pieces";

export function DisputeResolutionCenter() {
  const [items, setItems] = useState(disputeSeed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const selected = items.find((item) => item.id === selectedId);
  const filteredItems = items.filter((item) => {
    const matchesQuery = [
      item.id,
      item.order,
      item.buyer,
      item.merchant,
      item.reason,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
    return (
      matchesQuery &&
      (statusFilter === "All statuses" || item.status === statusFilter)
    );
  });
  const { pageRows, pagination } = useClientPagination(filteredItems);
  const update = (status: string, funds?: string) => {
    if (!selected) return;
    setItems((rows) =>
      rows.map((row) =>
        row.id === selected.id
          ? { ...row, status, funds: funds || row.funds }
          : row,
      ),
    );
    setSelectedId(null);
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpsMetric
          icon={Gavel}
          label="Open disputes"
          value="12"
          note="3 high priority"
          tone="danger"
        />
        <OpsMetric
          icon={LockKeyhole}
          label="Funds held"
          value="Rp4,82jt"
          note="Across 9 merchants"
          tone="warning"
        />
        <OpsMetric
          icon={RotateCcw}
          label="Refunded this month"
          value="Rp1,24jt"
          note="0,42% order rate"
        />
        <OpsMetric
          icon={Clock3}
          label="Median resolution"
          value="6j 18m"
          note="SLA target 24h"
          tone="success"
        />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-[#e5e8ef] p-4 sm:flex-row">
          <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#dfe3ec] px-3 text-[#7c879d]">
            <Search className="size-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dispute, order, buyer, merchant..."
              className="min-w-0 flex-1 bg-transparent text-[9px] outline-none"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-xl border border-[#dfe3ec] px-3 text-[9px] font-bold"
          >
            <option>All statuses</option>
            <option>New</option>
            <option>Evidence review</option>
            <option>Seller response</option>
            <option>Resolved</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <thead className="bg-[#f7f8fa] text-[8px] tracking-wider text-[#7c879d] uppercase">
              <tr>
                {[
                  "Case",
                  "Order",
                  "Buyer",
                  "Merchant",
                  "Reason",
                  "Amount",
                  "Funds",
                  "Evidence",
                  "Status",
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
              {pageRows.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-[#e8eaf0] text-[8px]"
                >
                  <td className="px-4 py-4 font-mono font-bold text-[#536fdf]">
                    {item.id}
                  </td>
                  <td className="font-mono">{item.order}</td>
                  <td>{item.buyer}</td>
                  <td className="font-bold">{item.merchant}</td>
                  <td className="max-w-[190px]">{item.reason}</td>
                  <td className="font-extrabold">{item.amount}</td>
                  <td>
                    <Status value={item.funds} />
                  </td>
                  <td>{item.evidence} files</td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>{item.age}</td>
                  <td>
                    <button
                      onClick={() => {
                        setSelectedId(item.id);
                        setRefunded(false);
                      }}
                      className="font-extrabold text-[#536fdf]"
                    >
                      Open case
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
      {selected && (
        <DisputeCaseDialog
          selected={selected}
          refunded={refunded}
          setRefunded={setRefunded}
          onClose={() => setSelectedId(null)}
          update={update}
        />
      )}
    </>
  );
}
