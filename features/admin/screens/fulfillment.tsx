"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Check,
  Eye,
  FileDown,
  Filter,
  LockKeyhole,
  PackageCheck,
  RefreshCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
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
      <section className={`${panel} mt-4 overflow-hidden`}>
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
          <div key={title as string} className={`${panel} p-5`}>
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

export { FulfillmentControl as AdminFulfillmentScreen };
