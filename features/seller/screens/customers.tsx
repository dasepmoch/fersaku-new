"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, MoreHorizontal, Search } from "lucide-react";
import { orders } from "@/lib/mock-data";
import { rupiah } from "@/lib/utils";
import { TablePagination } from "@/shared/ui/table-pagination";
import { useClientPagination } from "@/shared/ui/use-client-pagination";

const card = "rounded-[22px] border hairline bg-[#fbfaf7] shadow-card";
function OrderTable({ compact = false }: { compact?: boolean }) {
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
  const data = orders.map((o, i) => ({
    ...o,
    orders: [12, 8, 5, 3, 9, 6, 4, 11, 2, 7, 5, 3, 8][i % 13],
    spent: [
      948000, 732000, 547000, 299000, 412000, 680000, 255000, 1_120_000,
      188000, 503000, 367000, 921000, 144000,
    ][i % 13],
  }));
  const { pageRows, pagination } = useClientPagination(data);
  return (
    <section className={`${card} overflow-hidden`}>
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
  const o = orders.find((x) => x.id === id) || orders[0];
  return (
    <>
      <section className={`${card} p-5 sm:p-7`}>
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
        <section className={`${card} overflow-hidden`}>
          <SectionHead
            title="Riwayat pembelian"
            desc="Semua produk yang dibeli pelanggan"
          />
          <OrderTable compact />
        </section>
        <section className={`${card} p-5`}>
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
function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="hairline flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border bg-white px-3 text-[10px] text-[#829087]">
      <Search className="size-3.5" />
      <input
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none"
      />
    </div>
  );
}
function Status({ status }: { status: string }) {
  const positive = ["Paid", "Active", "Completed", "Delivered"].includes(
    status,
  );
  const pending = ["Pending", "Processing"].includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-extrabold ${positive ? "bg-[#e5f5e6] text-[#2e714f]" : pending ? "bg-[#fff4ce] text-[#8a6c22]" : "bg-[#ffebe3] text-[#a7573e]"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
function MiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={`${card} p-5`}>
      <p className="text-[9px] font-extrabold tracking-wider text-[#7d8982] uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-[9px] text-[#7d8982]">{note}</p>
    </div>
  );
}
function SectionHead({
  title,
  desc,
  link,
}: {
  title: string;
  desc: string;
  link?: string;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <div>
        <h2 className="text-sm font-extrabold">{title}</h2>
        <p className="mt-1 text-[10px] text-[#7d8982]">{desc}</p>
      </div>
      {link && (
        <Link
          href="/dashboard/orders"
          className="text-[10px] font-extrabold text-[#356549]"
        >
          {link} <ArrowRight className="ml-1 inline size-3" />
        </Link>
      )}
    </div>
  );
}

export {
  Customers as SellerCustomersScreen,
  CustomerDetail as SellerCustomerDetailScreen,
};
