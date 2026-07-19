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
  TransactionSourceBadge,
} from "@/features/admin/ui";

import Link from "next/link";
import { Check, MoreHorizontal, RefreshCcw } from "lucide-react";

import { useRef, useState } from "react";

import { rupiah } from "@/lib/utils";

import {
  mapAdminOrderFeeDisplay,
  useAdminOrder,
  useAdminOrderDeliveryResendEnabled,
  useAdminOrders,
  useAdminProviderLookupEnabled,
  useProviderLookupPaymentMutation,
  useResendAdminOrderDeliveryMutation,
} from "@/features/admin/data";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { getDomainSource } from "@/shared/data/domain-source";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

function Orders() {
  const isMock = getDomainSource("adminRead") === "mock";
  const { data } = useAdminOrders();
  const adminOrders = data ?? [];
  const { pageRows, pagination } = useClientPagination(adminOrders);

  const paidCount = adminOrders.filter((o) =>
    /paid|fulfill|deliver/i.test(o.status),
  ).length;
  const pendingCount = adminOrders.filter((o) =>
    /pending|unknown/i.test(o.status),
  ).length;
  const grossSum = adminOrders.reduce((s, o) => s + Math.max(0, o.gross), 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="Orders today"
          value={
            isMock ? "1,842" : adminOrders.length.toLocaleString("id-ID") || "—"
          }
          note={isMock ? "+14.2% vs yesterday" : "Current page"}
        />
        <Metric
          label="Paid volume"
          value={
            isMock ? "Rp84,2jt" : adminOrders.length ? rupiah(grossSum) : "—"
          }
          note={isMock ? "96.84% success" : "Listed orders"}
        />
        <Metric
          label="Pending"
          value={isMock ? "38" : String(pendingCount)}
          note={isMock ? "Rp5,8jt exposure" : "Pending / unknown"}
        />
        <Metric
          label="Fulfilled"
          value={isMock ? "1.791" : String(paidCount)}
          note={isMock ? "97.2% delivered" : "Paid / fulfilled"}
        />
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
                "Source",
                "Status",
                "Gross",
                "Total fee",
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
                    <TransactionSourceBadge source={o.source} />
                  </td>
                  <td>
                    <AdminStatus status={o.status} />
                  </td>
                  <td className="font-extrabold">{rupiah(o.gross)}</td>
                  <td>{rupiah(o.totalFeeCharged)}</td>
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
  const isMock = getDomainSource("adminRead") === "mock";
  const { data: order } = useAdminOrder(id);
  const canResend = useAdminOrderDeliveryResendEnabled();
  const canLookup = useAdminProviderLookupEnabled();
  const resendMutation = useResendAdminOrderDeliveryMutation();
  const lookupMutation = useProviderLookupPaymentMutation();
  const [action, setAction] = useState<"resend" | "verify" | null>(null);
  const idemRef = useRef<string | null>(null);

  if (!order) return null;

  const fees = mapAdminOrderFeeDisplay(order);
  // Snapshot chrome shows platform fee + processing fee labels; money from server total only.
  const platformFeeLabel =
    fees.totalFee > 0 ? rupiah(fees.platformFee) : isMock ? rupiah(0) : "—";
  const processingFeeLabel =
    fees.processingFee > 0
      ? rupiah(fees.processingFee)
      : fees.totalFee > 0
        ? "—"
        : isMock
          ? rupiah(0)
          : "—";
  const sellerNetLabel =
    fees.totalFee > 0 ? rupiah(fees.sellerNet) : isMock ? rupiah(0) : "—";

  const paymentIntentId =
    order.payment && order.payment !== "—"
      ? order.payment.startsWith("qris_") || order.payment.includes("_")
        ? order.payment
        : order.id
      : order.id;

  return (
    <>
      <div className="mb-4 flex gap-2">
        <AdminButton
          secondary
          disabled={!canResend || resendMutation.isPending}
          onClick={() => {
            if (!canResend) return;
            idemRef.current = null;
            setAction("resend");
          }}
        >
          <RefreshCcw className="size-4" /> Resend delivery
        </AdminButton>
        <AdminButton
          secondary
          disabled={!canLookup || lookupMutation.isPending}
          onClick={() => {
            if (!canLookup) return;
            idemRef.current = null;
            setAction("verify");
          }}
        >
          <Check className="size-4" /> Verify payment
        </AdminButton>
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
              <div className="mt-3">
                <TransactionSourceBadge source={order.source} />
              </div>
            </div>
            <AdminStatus status={order.status} />
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-4">
            <Metric label="Gross" value={rupiah(order.gross)} />
            <Metric label="Platform fee (3%)" value={platformFeeLabel} />
            <Metric label="Seller net" value={sellerNetLabel} />
            <Metric label="Payment processing fee" value={processingFeeLabel} />
          </div>
          <div className="mt-7 grid gap-6 border-t border-[#e6e9ef] pt-6 sm:grid-cols-2">
            <Info
              title="Customer"
              rows={[
                ["Name", order.customer],
                ["Email", isMock ? "buyer@example.com" : "—"],
                ["IP address", isMock ? "180.252.81.42" : "—"],
                ["Device", isMock ? "Chrome • Android" : "—"],
              ]}
            />
            <Info
              title="Payment"
              rows={[
                ["Method", isMock ? "QRIS" : order.payment || "—"],
                ["Intent", isMock ? "qris_2Yc91p" : order.payment || "—"],
                ["Provider", isMock ? "Xendit" : "—"],
                ["Provider reference", isMock ? "XND-9821041" : "—"],
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
            {(isMock
              ? [
                  ["Order created", "14:32:08", "Customer submitted checkout"],
                  [
                    "QRIS generated",
                    "14:32:09",
                    "Xendit returned payment image",
                  ],
                  [
                    "Payment callback verified",
                    "14:33:21",
                    "Signature matched",
                  ],
                  ["Order marked paid", "14:33:22", "Idempotency key accepted"],
                  [
                    "Delivery fulfilled",
                    "14:33:23",
                    "Download token generated",
                  ],
                  [
                    "Seller balance credited",
                    "14:33:23",
                    "Settlement scheduled T+1",
                  ],
                ]
              : [
                  [
                    "Order status",
                    order.created,
                    `${order.status} · server read model (no client timeline invent)`,
                  ],
                  [
                    "Payment",
                    order.payment || "—",
                    "Intent/status from order projection only",
                  ],
                  [
                    "Fees",
                    rupiah(order.totalFeeCharged),
                    order.totalFeeCharged > 0
                      ? "Server totalFeeCharged"
                      : "No fee posted (unpaid/failed)",
                  ],
                ]
            ).map((e, i, arr) => (
              <div key={e[0]} className="relative flex gap-3 pb-5 last:pb-0">
                <div className="relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#edf1ff] text-[#5b7cfa]">
                  <Check className="size-3" />
                </div>
                {i < arr.length - 1 && (
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
        <ControlDialog
          title={
            action === "verify"
              ? "Verify payment with Xendit"
              : "Resend delivery email"
          }
          target={order.id}
          auditHandledExternally
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            if (!idemRef.current) {
              idemRef.current = createIdempotencyKey();
            }
            if (action === "verify") {
              await lookupMutation.mutateAsync({
                paymentIntentId,
                reason,
                idempotencyKey: idemRef.current,
              });
            } else {
              await resendMutation.mutateAsync({
                orderId: order.id,
                reason,
                idempotencyKey: idemRef.current,
              });
            }
            setAction(null);
          }}
        />
      )}
    </>
  );
}

export { Orders as AdminOrdersScreen, OrderDetail as AdminOrderDetailScreen };
