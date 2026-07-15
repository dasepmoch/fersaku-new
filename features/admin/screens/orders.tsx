"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Check,
  FileDown,
  Filter,
  LockKeyhole,
  MoreHorizontal,
  RefreshCcw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { adminOrders } from "@/lib/admin-mock-data";
import { rupiah } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const panel =
  "rounded-[20px] border border-[#dfe3ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,.03),0_10px_34px_rgba(16,24,40,.045)]";
function AdminButton({
  children,
  secondary = false,
  onClick,
}: {
  children: React.ReactNode;
  secondary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-extrabold transition ${secondary ? "border border-[#d8dde8] bg-white text-[#3c465d] hover:bg-[#f8f9fb]" : "bg-[#11182a] text-white hover:-translate-y-0.5 hover:bg-[#202b48]"}`}
    >
      {children}
    </button>
  );
}
function Orders() {
  const { pageRows, pagination } = useClientPagination(adminOrders);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Orders today" value="1,842" note="+14.2% vs yesterday" />
        <Metric label="Paid volume" value="Rp84,2jt" note="96.84% success" />
        <Metric label="Pending" value="38" note="Rp5,8jt exposure" />
        <Metric label="Refunded" value="Rp1,24jt" note="0.42% refund rate" />
      </div>
      <section className={`${panel} mt-4 overflow-hidden`}>
        <TableToolbar placeholder="Search order ID, customer, merchant, product..." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <TableHeader
              labels={[
                "Order",
                "Merchant",
                "Customer",
                "Product",
                "Payment",
                "Status",
                "Gross",
                "Platform fee",
                "Created",
                "",
              ]}
            />
            <tbody>
              {pageRows.map((o) => (
                <tr key={o.id} className="border-t border-[#e8eaf0] text-[9px]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-bold text-[#4568df]"
                    >
                      {o.id}
                    </Link>
                  </td>
                  <td className="font-bold">{o.store}</td>
                  <td>{o.customer}</td>
                  <td>{o.product}</td>
                  <td>{o.payment}</td>
                  <td>
                    <AdminStatus status={o.status} />
                  </td>
                  <td className="font-extrabold">{rupiah(o.gross)}</td>
                  <td>{rupiah(o.fee)}</td>
                  <td>{o.created}</td>
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
    </>
  );
}
function OrderDetail({ id }: { id: string }) {
  const order = adminOrders.find((o) => o.id === id) || adminOrders[0];
  const [action, setAction] = useState<string | null>(null);
  return (
    <>
      <div className="mb-4 flex gap-2">
        <AdminButton
          secondary
          onClick={() => setAction("Resend delivery email")}
        >
          <RefreshCcw className="size-4" /> Resend delivery
        </AdminButton>
        <AdminButton secondary onClick={() => setAction("Mark order as paid")}>
          <Check className="size-4" /> Mark paid
        </AdminButton>
        <button
          onClick={() => setAction("Issue full refund")}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#f0c6c2] bg-[#fff5f4] px-4 text-[10px] font-extrabold text-[#c95049]"
        >
          <RotateCcw className="size-4" /> Refund order
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className={`${panel} p-6`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-xs font-bold text-[#5b7cfa]">
                {order.id}
              </p>
              <h2 className="mt-2 text-2xl font-black">{order.product}</h2>
              <p className="mt-1 text-[10px] text-[#7f899d]">
                {order.store} • {order.created}
              </p>
            </div>
            <AdminStatus status={order.status} />
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-4">
            <Metric label="Gross" value={rupiah(order.gross)} />
            <Metric label="Platform fee" value={rupiah(order.fee)} />
            <Metric
              label="Seller net"
              value={rupiah(order.gross - order.fee - 700)}
            />
            <Metric label="Payment fee" value="Rp700" />
          </div>
          <div className="mt-7 grid gap-6 border-t border-[#e6e9ef] pt-6 sm:grid-cols-2">
            <Info
              title="Customer"
              rows={[
                ["Name", order.customer],
                ["Email", "buyer@example.com"],
                ["IP address", "180.252.81.42"],
                ["Device", "Chrome • Android"],
              ]}
            />
            <Info
              title="Payment"
              rows={[
                ["Method", "QRIS"],
                ["Intent", "qris_2Yc91p"],
                ["Provider", "Duitku"],
                ["Provider reference", "DKT-9821041"],
              ]}
            />
          </div>
        </section>
        <section className={`${panel} overflow-hidden`}>
          <PanelHead
            title="Order event timeline"
            desc="Complete transaction lifecycle"
          />
          <div className="p-5">
            {[
              ["Order created", "14:32:08", "Customer submitted checkout"],
              ["QRIS generated", "14:32:09", "Duitku returned payment image"],
              ["Payment callback verified", "14:33:21", "Signature matched"],
              ["Order marked paid", "14:33:22", "Idempotency key accepted"],
              ["Delivery fulfilled", "14:33:23", "Download token generated"],
              [
                "Seller balance credited",
                "14:33:23",
                "Settlement scheduled T+1",
              ],
            ].map((e, i) => (
              <div key={e[0]} className="relative flex gap-3 pb-5 last:pb-0">
                <div className="relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#edf1ff] text-[#5b7cfa]">
                  <Check className="size-3" />
                </div>
                {i < 5 && (
                  <span className="absolute top-6 left-[11px] h-full w-px bg-[#dfe3ec]" />
                )}
                <div>
                  <p className="text-[9px] font-extrabold">{e[0]}</p>
                  <p className="mt-1 text-[8px] text-[#8791a5]">
                    {e[1]} • {e[2]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {action && (
        <ControlDialog title={action} onClose={() => setAction(null)} />
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

export { Orders as AdminOrdersScreen, OrderDetail as AdminOrderDetailScreen };
