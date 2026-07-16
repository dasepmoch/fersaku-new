"use client";

import {
  adminPanel,
  AdminButton,
  PanelHead,
  Metric,
  TableToolbar,
  TableHeader,
  AdminStatus,
  ControlDialog,
  Info,
} from "@/features/admin/ui";

import Link from "next/link";
import { Check, MoreHorizontal, RefreshCcw, RotateCcw } from "lucide-react";

import { useState } from "react";

import { rupiah } from "@/lib/utils";

import { useAdminOrder, useAdminOrders } from "@/features/admin/data";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

function Orders() {
  const { data } = useAdminOrders();
  const adminOrders = data ?? [];
  const { pageRows, pagination } = useClientPagination(adminOrders);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Orders today" value="1,842" note="+14.2% vs yesterday" />
        <Metric label="Paid volume" value="Rp84,2jt" note="96.84% success" />
        <Metric label="Pending" value="38" note="Rp5,8jt exposure" />
        <Metric label="Refunded" value="Rp1,24jt" note="0.42% refund rate" />
      </div>
      <section className={`${adminPanel} mt-4 overflow-hidden`}>
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
  const { data: order } = useAdminOrder(id);
  const [action, setAction] = useState<string | null>(null);
  if (!order) return null;
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
        <section className={`${adminPanel} p-6`}>
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
        <section className={`${adminPanel} overflow-hidden`}>
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

export { Orders as AdminOrdersScreen, OrderDetail as AdminOrderDetailScreen };
