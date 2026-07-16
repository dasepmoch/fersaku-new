"use client";

import {
  adminPanel,
  Metric,
  TableToolbar,
  TableHeader,
  AdminStatus,
  ControlDialog,
} from "@/features/admin/ui";

import Link from "next/link";
import { Ban, Eye, PackageCheck, RefreshCcw, ShieldCheck } from "lucide-react";

import { useState } from "react";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

function FulfillmentControl() {
  const [rows, setRows] = useState([
    {
      id: "dlv_92841",
      order: "FRS-240712-1842",
      merchant: "Asep AI Tools",
      type: "Download",
      target: "AI Prompt Pack",
      status: "Fulfilled",
      attempts: 1,
      time: "14:33:23",
    },
    {
      id: "dlv_92840",
      order: "FRS-240712-1839",
      merchant: "Digital Supply ID",
      type: "Credentials",
      target: "Canva Pro Team",
      status: "Fulfilled",
      attempts: 1,
      time: "14:31:18",
    },
    {
      id: "dlv_92836",
      order: "FRS-240712-1834",
      merchant: "KodeKita",
      type: "Stock code",
      target: "Steam Wallet",
      status: "Failed",
      attempts: 3,
      time: "14:24:01",
    },
    {
      id: "dlv_92831",
      order: "FRS-240712-1821",
      merchant: "DesignKit Studio",
      type: "Protected link",
      target: "Figma Landing Kit",
      status: "Pending",
      attempts: 0,
      time: "14:18:44",
    },
  ]);
  const [action, setAction] = useState<string | null>(null);
  const { pageRows, pagination } = useClientPagination(rows);
  const retry = (id: string) =>
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, status: "Fulfilled", attempts: row.attempts + 1 }
          : row,
      ),
    );
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Fulfilled today" value="1,804" note="99.62% success" />
        <Metric label="Pending queue" value="7" note="Oldest 42 seconds" />
        <Metric
          label="Failed"
          value="4"
          note="Requires attention"
          tone="danger"
        />
        <Metric
          label="Median delivery"
          value="184ms"
          note="Payment to access"
        />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
        <TableToolbar placeholder="Search delivery, order, merchant, or product..." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <TableHeader
              labels={[
                "Delivery",
                "Order",
                "Merchant",
                "Type",
                "Target",
                "Status",
                "Attempts",
                "Created",
                "Controls",
              ]}
            />
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[#e8eaf0] text-[9px]"
                >
                  <td className="px-5 py-4 font-mono font-bold text-[#5b7cfa]">
                    {row.id}
                  </td>
                  <td>
                    <Link
                      href={`/admin/orders/${row.order}`}
                      className="font-mono font-bold"
                    >
                      {row.order}
                    </Link>
                  </td>
                  <td>{row.merchant}</td>
                  <td>
                    <span className="rounded-lg bg-[#eef1f6] px-2 py-1 font-bold">
                      {row.type}
                    </span>
                  </td>
                  <td>{row.target}</td>
                  <td>
                    <AdminStatus status={row.status} />
                  </td>
                  <td>{row.attempts}</td>
                  <td>{row.time}</td>
                  <td>
                    <div className="flex gap-2">
                      {row.status === "Failed" && (
                        <button
                          onClick={() => retry(row.id)}
                          title="Retry fulfillment"
                          className="rounded-lg border border-[#dce1e9] p-2"
                        >
                          <RefreshCcw className="size-3" />
                        </button>
                      )}
                      <button
                        onClick={() => setAction(`Inspect ${row.id}`)}
                        title="Inspect delivery"
                        className="rounded-lg border border-[#dce1e9] p-2"
                      >
                        <Eye className="size-3" />
                      </button>
                      <button
                        onClick={() => setAction(`Revoke ${row.id}`)}
                        title="Revoke delivery"
                        className="rounded-lg border border-[#efc8c4] p-2 text-[#c6534c]"
                      >
                        <Ban className="size-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} />
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {[
          [
            PackageCheck,
            "Atomic stock allocation",
            "Exactly one stock item is locked and assigned per paid order.",
          ],
          [
            RefreshCcw,
            "Idempotent retries",
            "Repeated jobs return the original delivery instead of consuming new stock.",
          ],
          [
            ShieldCheck,
            "Revocable access",
            "Download tokens and protected links can be revoked without deleting order history.",
          ],
        ].map(([Icon, title, desc]) => (
          <div key={title as string} className={`${adminPanel} p-5`}>
            <Icon className="size-4 text-[#5b7cfa]" />
            <b className="mt-5 block text-[9px]">{title as string}</b>
            <p className="mt-2 text-[8px] leading-4 text-[#7d879b]">
              {desc as string}
            </p>
          </div>
        ))}
      </div>
      {action && (
        <ControlDialog
          title={action}
          onClose={() => setAction(null)}
          danger={action.includes("Revoke")}
        />
      )}
    </>
  );
}

export { FulfillmentControl as AdminFulfillmentScreen };
