"use client";

import {
  sellerCard,
  SearchBox,
  FilterButton,
  MiniStat,
} from "@/features/seller/ui";

import { Check, CheckCircle2, FileDown, MoreHorizontal } from "lucide-react";

import { useState } from "react";

import { useSellerOrder, useSellerOrders } from "@/features/orders/hooks";

import { rupiah } from "@/lib/utils";

import { DEMO_STORE_ID } from "@/shared/config/demo";

import { SectionHead } from "@/shared/ui/section-head";

import { StatusBadge } from "@/shared/ui/status-badge";

import { TablePagination } from "@/shared/ui/table-pagination";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

function Orders() {
  return (
    <section className={`${sellerCard} overflow-hidden`}>
      <div className="hairline flex flex-col gap-3 border-b p-4 sm:flex-row">
        <SearchBox placeholder="Cari pesanan, nama, atau email..." />
        <div className="flex gap-2 sm:ml-auto">
          <FilterButton />
          <button className="hairline flex items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold">
            <FileDown className="size-3.5" /> Export
          </button>
        </div>
      </div>
      <div className="hairline flex gap-1 overflow-x-auto border-b px-4 pt-2">
        {["Semua 482", "Paid 431", "Pending 38", "Failed 13"].map((x, i) => (
          <button
            key={x}
            className={`border-b-2 px-4 py-3 text-[10px] font-extrabold whitespace-nowrap ${i === 0 ? "border-[#173f2c] text-[#173f2c]" : "border-transparent text-[#829087]"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <OrderTable />
    </section>
  );
}
function OrderTable({ compact = false }: { compact?: boolean }) {
  const { data } = useSellerOrders(DEMO_STORE_ID);
  const orders = data?.items ?? [];
  const source = compact ? orders.slice(0, 4) : orders;
  const { pageRows, pagination } = useClientPagination(source);
  return (
    <>
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
            {pageRows.map((o) => (
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
      <TablePagination {...pagination} />
    </>
  );
}
function SellerOrderDetail({ id }: { id: string }) {
  const { data: order } = useSellerOrder(DEMO_STORE_ID, id);
  const [resent, setResent] = useState(false);
  if (!order) return null;
  const o = order;
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
          <MiniStat label="Biaya" value="Rp3.070" note="Platform + payment" />
          <MiniStat
            label="Pendapatan bersih"
            value={rupiah(o.amount - 3070)}
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
              ["Metode", "QRIS"],
              ["Payment intent", "qris_2Yc91p"],
              ["Provider", "Xendit"],
              ["Status", o.status],
            ]}
          />
        </div>
        <div className="mt-7 rounded-2xl bg-[#eef3e9] p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[#2e714f]" />
            <h3 className="text-xs font-extrabold">Delivery fulfilled</h3>
          </div>
          <p className="mt-2 text-[9px] leading-4 text-[#6c7971]">
            Link download dibuat dan dikirim ke {o.email}. Digunakan 1 dari 5
            kali.
          </p>
          <button
            onClick={() => setResent(true)}
            className="hairline mt-4 rounded-lg border bg-white px-3 py-2 text-[9px] font-bold"
          >
            {resent
              ? "Email berhasil dikirim ulang"
              : "Kirim ulang email delivery"}
          </button>
        </div>
      </section>
      <section className={`${sellerCard} overflow-hidden`}>
        <SectionHead
          title="Timeline pesanan"
          desc="Semua perubahan pada order"
        />
        <div className="p-5">
          {[
            ["Pesanan dibuat", "14:32:08"],
            ["QRIS dibuat", "14:32:09"],
            ["Pembayaran terkonfirmasi", "14:33:21"],
            ["Delivery berhasil", "14:33:23"],
            ["Saldo seller dikreditkan", "14:33:23"],
          ].map((x, i) => (
            <div key={x[0]} className="relative flex gap-3 pb-6 last:pb-0">
              <span className="relative z-10 grid size-6 place-items-center rounded-full bg-[#dff2e2] text-[#2e714f]">
                <Check className="size-3" />
              </span>
              {i < 4 && (
                <span className="absolute top-6 left-[11px] h-full w-px bg-[#dfe3dc]" />
              )}
              <div>
                <b className="block text-[10px]">{x[0]}</b>
                <span className="text-[8px] text-[#7f8a83]">
                  12 Jul 2026 • {x[1]}
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
};
