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
import {
  Ban,
  Eye,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  X,
} from "lucide-react";

import { useState } from "react";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

type FulfillmentStatus = "Fulfilled" | "Failed" | "Pending" | "Revoked";

type FulfillmentRow = {
  id: string;
  order: string;
  merchant: string;
  type: string;
  target: string;
  status: FulfillmentStatus;
  attempts: number;
  time: string;
};

type FulfillmentAction = {
  kind: "inspect" | "retry" | "revoke";
  rowId: string;
};

const initialFulfillmentRows: FulfillmentRow[] = [
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
];

function FulfillmentControl() {
  const [rows, setRows] = useState(initialFulfillmentRows);
  const [action, setAction] = useState<FulfillmentAction | null>(null);
  const { pageRows, pagination } = useClientPagination(rows);
  const actionRow = rows.find((row) => row.id === action?.rowId);
  const confirmAction = () => {
    if (!action || action.kind === "inspect") return;
    setRows((current) =>
      current.map((row) =>
        row.id !== action.rowId
          ? row
          : action.kind === "retry" && row.status === "Failed"
            ? {
                ...row,
                status: "Fulfilled",
                attempts: row.attempts + 1,
              }
            : action.kind === "revoke" && row.status !== "Revoked"
              ? { ...row, status: "Revoked" }
              : row,
      ),
    );
  };
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
                          onClick={() =>
                            setAction({ kind: "retry", rowId: row.id })
                          }
                          title="Retry fulfillment"
                          aria-label={`Retry fulfillment ${row.id}`}
                          className="rounded-lg border border-[#dce1e9] p-2"
                        >
                          <RefreshCcw className="size-3" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setAction({ kind: "inspect", rowId: row.id })
                        }
                        title="Inspect delivery"
                        aria-label={`Inspect delivery ${row.id}`}
                        className="rounded-lg border border-[#dce1e9] p-2"
                      >
                        <Eye className="size-3" />
                      </button>
                      {row.status !== "Revoked" && (
                        <button
                          onClick={() =>
                            setAction({ kind: "revoke", rowId: row.id })
                          }
                          title="Revoke delivery"
                          aria-label={`Revoke delivery ${row.id}`}
                          className="rounded-lg border border-[#efc8c4] p-2 text-[#c6534c]"
                        >
                          <Ban className="size-3" />
                        </button>
                      )}
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
      {action && action.kind !== "inspect" && actionRow && (
        <ControlDialog
          title={`${action.kind === "retry" ? "Retry fulfillment" : "Revoke delivery"} ${actionRow.id}`}
          target={actionRow.id}
          onClose={() => setAction(null)}
          onConfirm={confirmAction}
          danger={action.kind === "revoke"}
        />
      )}
      {action?.kind === "inspect" && actionRow && (
        <FulfillmentInspectionDialog
          row={actionRow}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

function FulfillmentInspectionDialog({
  row,
  onClose,
}: {
  row: FulfillmentRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#080d1b]/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fulfillment-inspection-title"
        className="w-full max-w-md rounded-[24px] border border-white/10 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start">
          <span className="grid size-11 place-items-center rounded-xl bg-[#edf1ff] text-[#5b7cfa]">
            <Eye className="size-5" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fulfillment inspection"
            className="ml-auto"
          >
            <X className="size-4" />
          </button>
        </div>
        <h3
          id="fulfillment-inspection-title"
          className="mt-5 text-lg font-black tracking-[-.03em]"
        >
          Inspect delivery {row.id}
        </h3>
        <p className="mt-2 text-[9px] leading-4 text-[#7d879b]">
          Read-only delivery evidence. Inspecting this record does not mutate
          fulfillment state or create a success audit event.
        </p>
        <div className="mt-5 grid gap-3">
          {[
            ["Order", row.order],
            ["Merchant", row.merchant],
            ["Delivery type", row.type],
            ["Target", row.target],
            ["Status", row.status],
            ["Attempts", String(row.attempts)],
            ["Created", row.time],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 border-b border-[#edf0f4] pb-3 text-[8px]"
            >
              <span className="text-[#7d879b]">{label}</span>
              <b className="text-right">{value}</b>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 h-10 w-full rounded-xl bg-[#11182a] text-[9px] font-extrabold text-white"
        >
          Close
        </button>
      </section>
    </div>
  );
}

export { FulfillmentControl as AdminFulfillmentScreen };
