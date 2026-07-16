"use client";

import { sellerCard, SearchBox, Status, MiniStat } from "@/features/seller/ui";

import { ChevronRight, MoreHorizontal } from "lucide-react";

import { rupiah } from "@/lib/utils";

import {
  useSellerCustomer,
  useSellerCustomers,
} from "@/features/seller/customers/hooks";

import { DEMO_STORE_ID } from "@/shared/config/demo";

import { TablePagination } from "@/shared/ui/table-pagination";
import { SectionHead } from "@/shared/ui/section-head";

import { useClientPagination } from "@/shared/ui/use-client-pagination";

function OrderTable({ compact = false }: { compact?: boolean }) {
  const { data: customers = [] } = useSellerCustomers(DEMO_STORE_ID);
  const source = compact ? customers.slice(0, 4) : customers;
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
                  <Status status={o.status} />
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
function Customers() {
  const { data: customers } = useSellerCustomers(DEMO_STORE_ID);
  const data = customers ?? [];
  const { pageRows, pagination } = useClientPagination(data);
  return (
    <section className={`${sellerCard} overflow-hidden`}>
      <div className="hairline flex gap-3 border-b p-4">
        <SearchBox placeholder="Cari pelanggan..." />
        <button className="hairline ml-auto rounded-xl border bg-white px-4 text-[10px] font-bold">
          Export CSV
        </button>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <MiniStat label="Total pelanggan" value="1.284" note="+86 bulan ini" />
        <MiniStat label="Repeat buyers" value="18,4%" note="236 pelanggan" />
        <MiniStat
          label="Nilai rata-rata"
          value="Rp126rb"
          note="per pelanggan"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="bg-[#f3f4ef] text-[9px] tracking-wider text-[#7f8a83] uppercase">
              <th className="px-5 py-3">Pelanggan</th>
              <th>Pesanan</th>
              <th>Total belanja</th>
              <th>Terakhir beli</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.id} className="hairline border-t text-xs">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-[#dfe8dc] text-[9px] font-bold">
                      {c.avatar}
                    </span>
                    <div>
                      <b>{c.customer}</b>
                      <span className="block text-[9px] text-[#849087]">
                        {c.email}
                      </span>
                    </div>
                  </div>
                </td>
                <td>{c.orders}</td>
                <td className="font-extrabold">{rupiah(c.spent)}</td>
                <td className="text-[#758179]">{c.date}</td>
                <td>
                  <ChevronRight className="size-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination {...pagination} />
    </section>
  );
}
function CustomerDetail({ id }: { id: string }) {
  const { data: customer } = useSellerCustomer(DEMO_STORE_ID, id);
  if (!customer) return null;
  const o = customer;
  return (
    <>
      <section className={`${sellerCard} p-5 sm:p-7`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="grid size-16 place-items-center rounded-full bg-[#dfe8dc] text-sm font-black">
            {o.avatar}
          </span>
          <div>
            <h2 className="text-xl font-extrabold">{o.customer}</h2>
            <p className="mt-1 text-[10px] text-[#748078]">
              {o.email} • Customer since 18 Mar 2026
            </p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button className="hairline h-10 rounded-xl border bg-white px-4 text-[10px] font-bold">
              Kirim email
            </button>
            <button className="h-10 rounded-xl bg-[#173f2c] px-4 text-[10px] font-extrabold text-white">
              Tambah catatan
            </button>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          <MiniStat
            label="Total belanja"
            value="Rp948.000"
            note="Lifetime value"
          />
          <MiniStat label="Pesanan" value="12" note="Semua paid" />
          <MiniStat
            label="Rata-rata order"
            value="Rp79.000"
            note="Per transaksi"
          />
          <MiniStat
            label="Produk dimiliki"
            value="4"
            note="2 repeat purchase"
          />
        </div>
      </section>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className={`${sellerCard} overflow-hidden`}>
          <SectionHead
            title="Riwayat pembelian"
            desc="Semua produk yang dibeli pelanggan"
          />
          <OrderTable compact />
        </section>
        <section className={`${sellerCard} p-5`}>
          <h3 className="text-xs font-extrabold">Catatan internal</h3>
          <textarea
            rows={5}
            placeholder="Tulis catatan tentang pelanggan ini..."
            className="hairline mt-4 w-full resize-none rounded-xl border p-3 text-[10px] outline-none"
          />
          <button className="mt-3 h-10 w-full rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white">
            Simpan catatan
          </button>
          <div className="hairline mt-5 border-t pt-5">
            <h4 className="text-[10px] font-extrabold">Marketing consent</h4>
            <p className="mt-1 text-[9px] text-[#748078]">
              Subscribed during checkout • 18 Mar 2026
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
export {
  Customers as SellerCustomersScreen,
  CustomerDetail as SellerCustomerDetailScreen,
};
