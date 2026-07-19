"use client";

import {
  sellerCard,
  SearchBox,
  FilterButton,
  MiniStat,
} from "@/features/seller/ui";

import { Check, CheckCircle2, FileDown, MoreHorizontal } from "lucide-react";

import { useMemo, useState } from "react";

import {
  useResendSellerOrderDelivery,
  useSellerOrder,
  useSellerOrders,
} from "@/features/orders/hooks";
import type { SellerOrderStatusTab } from "@/features/orders/contracts";

import { rupiah } from "@/lib/utils";

import { useSellerStoreId } from "@/shared/seller/current-store";

import { SectionHead } from "@/shared/ui/section-head";

import { StatusBadge } from "@/shared/ui/status-badge";

import { TablePagination } from "@/shared/ui/table-pagination";

function Orders() {
  const storeId = useSellerStoreId();
  const [q, setQ] = useState("");
  const [statusTab, setStatusTab] = useState<SellerOrderStatusTab>("Semua");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const filters = useMemo(
    () => ({
      q,
      statusTab,
      page,
      pageSize,
    }),
    [q, statusTab, page, pageSize],
  );

  const { data } = useSellerOrders(storeId, filters);
  const orders = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const pageCount = Math.max(1, data?.pageCount ?? 1);
  const safePage = Math.min(Math.max(data?.page ?? page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = total === 0 ? 0 : Math.min(start + orders.length, total);

  const tabs: { key: SellerOrderStatusTab; label: string }[] = [
    { key: "Semua", label: "Semua" },
    { key: "Paid", label: "Paid" },
    { key: "Pending", label: "Pending" },
    { key: "Failed", label: "Failed" },
  ];

  return (
    <section className={`${sellerCard} overflow-hidden`}>
      <div className="hairline flex flex-col gap-3 border-b p-4 sm:flex-row">
        <SearchBox
          placeholder="Cari pesanan, nama, atau email..."
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
        <div className="flex gap-2 sm:ml-auto">
          <FilterButton />
          <button className="hairline flex items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold">
            <FileDown className="size-3.5" /> Export
          </button>
        </div>
      </div>
      <div className="hairline flex gap-1 overflow-x-auto border-b px-4 pt-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatusTab(tab.key);
              setPage(1);
            }}
            className={`border-b-2 px-4 py-3 text-[10px] font-extrabold whitespace-nowrap ${statusTab === tab.key ? "border-[#173f2c] text-[#173f2c]" : "border-transparent text-[#829087]"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <OrderTable rows={orders} />
      <TablePagination
        page={safePage}
        pageSize={pageSize}
        total={total}
        pageCount={pageCount}
        start={start}
        end={end}
        setPage={setPage}
        setPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        pageSizeOptions={[5, 10, 25, 50]}
      />
    </section>
  );
}
function OrderTable({
  rows,
  compact = false,
}: {
  rows?: {
    id: string;
    date: string;
    avatar: string;
    customer: string;
    email: string;
    product: string;
    status: string;
    amount: number;
  }[];
  compact?: boolean;
}) {
  const storeId = useSellerStoreId();
  const { data } = useSellerOrders(storeId, { page: 1, pageSize: 20 });
  const orders = rows ?? data?.items ?? [];
  const source = compact ? orders.slice(0, 4) : orders;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="bg-[#f3f4ef] text-[9px] font-extrabold tracking-wider text-[#7f8a83] uppercase">
            <th className="px-5 py-3">Pesanan</th>
            <th className="px-5 py-3">Pelanggan</th>
            <th className="px-5 py-3">Produk</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Total</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {source.map((o) => (
            <tr
              key={o.id}
              className="hairline border-t text-[11px] hover:bg-[#f8f8f4]"
            >
              <td className="px-5 py-4">
                <b>{o.id}</b>
                <span className="mt-1 block text-[9px] text-[#8a948e]">
                  {o.date}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-full bg-[#e3e8df] text-[9px] font-extrabold">
                    {o.avatar}
                  </span>
                  <div>
                    <b>{o.customer}</b>
                    <span className="block text-[9px] text-[#849087]">
                      {o.email}
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 font-semibold">{o.product}</td>
              <td className="px-5 py-4">
                <StatusBadge status={o.status} />
              </td>
              <td className="px-5 py-4 text-right font-extrabold">
                {rupiah(o.amount)}
              </td>
              <td>
                <MoreHorizontal className="size-4" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function SellerOrderDetail({ id }: { id: string }) {
  const storeId = useSellerStoreId();
  const { data: order } = useSellerOrder(storeId, id);
  const resend = useResendSellerOrderDelivery(storeId, id);
  if (!order) return null;
  const o = order;
  const fee = o.feeIdr ?? 0;
  const net = o.merchantNetIdr ?? o.amount - fee;
  const payment = o.payment ?? {
    method: "QRIS",
    paymentIntent: "—",
    provider: "—",
    status: o.status,
  };
  const delivery = o.delivery;
  const timeline = o.timeline ?? [];
  const resent = resend.isSuccess;
  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className={`${sellerCard} p-5 sm:p-7`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-[#477057]">#{o.id}</p>
            <h2 className="mt-2 text-2xl font-extrabold">{o.product}</h2>
            <p className="mt-1 text-[10px] text-[#7a867f]">Dibuat {o.date}</p>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <MiniStat
            label="Total"
            value={rupiah(o.amount)}
            note="Gross amount"
          />
          <MiniStat
            label="Biaya"
            value={rupiah(fee)}
            note="Platform + payment"
          />
          <MiniStat
            label="Pendapatan bersih"
            value={rupiah(net)}
            note="Masuk settlement"
          />
        </div>
        <div className="hairline mt-7 grid gap-7 border-t pt-7 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-extrabold">Pelanggan</h3>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#e2e8df] text-[10px] font-black">
                {o.avatar}
              </span>
              <div>
                <b className="text-xs">{o.customer}</b>
                <p className="text-[9px] text-[#7a867f]">{o.email}</p>
              </div>
            </div>
          </div>
          <InfoList
            title="Pembayaran"
            rows={[
              ["Metode", payment.method],
              ["Payment intent", payment.paymentIntent],
              ["Provider", payment.provider],
              ["Status", payment.status],
            ]}
          />
        </div>
        {delivery ? (
          <div className="mt-7 rounded-2xl bg-[#eef3e9] p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-[#2e714f]" />
              <h3 className="text-xs font-extrabold">
                {delivery.fulfilled ? "Delivery fulfilled" : "Delivery"}
              </h3>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-[#6c7971]">
              {delivery.summary}
            </p>
            <button
              type="button"
              disabled={resend.isPending || resent}
              onClick={() => {
                if (!resent) resend.mutate(undefined);
              }}
              className="hairline mt-4 rounded-lg border bg-white px-3 py-2 text-[9px] font-bold disabled:opacity-60"
            >
              {resent
                ? "Email berhasil dikirim ulang"
                : resend.isPending
                  ? "Mengirim..."
                  : "Kirim ulang email delivery"}
            </button>
          </div>
        ) : null}
      </section>
      <section className={`${sellerCard} overflow-hidden`}>
        <SectionHead
          title="Timeline pesanan"
          desc="Semua perubahan pada order"
        />
        <div className="p-5">
          {timeline.map((x, i) => (
            <div
              key={`${x.label}-${i}`}
              className="relative flex gap-3 pb-6 last:pb-0"
            >
              <span className="relative z-10 grid size-6 place-items-center rounded-full bg-[#dff2e2] text-[#2e714f]">
                <Check className="size-3" />
              </span>
              {i < timeline.length - 1 && (
                <span className="absolute top-6 left-[11px] h-full w-px bg-[#dfe3dc]" />
              )}
              <div>
                <b className="block text-[10px]">{x.label}</b>
                <span className="text-[8px] text-[#7f8a83]">
                  {x.atDisplay} • {x.timeDisplay}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
function InfoList({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div>
      <h3 className="text-xs font-extrabold">{title}</h3>
      <div className="mt-4 grid gap-3">
        {rows.map((x) => (
          <div key={x[0]} className="flex justify-between text-[9px]">
            <span className="text-[#7a867f]">{x[0]}</span>
            <b>{x[1]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
export {
  Orders as SellerOrdersScreen,
  SellerOrderDetail as SellerOrderDetailScreen,
  OrderTable as SellerOrderTable,
};
