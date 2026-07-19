"use client";

import { sellerCard, SearchBox, Status, MiniStat } from "@/features/seller/ui";

import { ChevronRight, MoreHorizontal } from "lucide-react";

import { useMemo, useState } from "react";

import { rupiah } from "@/lib/utils";

import {
  useSellerCustomer,
  useSellerCustomers,
  useUpsertSellerCustomerNote,
} from "@/features/seller/customers/hooks";
import type { SellerCustomerHistoryItem } from "@/features/seller/customers/contracts";

import { useSellerStoreId } from "@/shared/seller/current-store";

import { TablePagination } from "@/shared/ui/table-pagination";
import { SectionHead } from "@/shared/ui/section-head";

function OrderTable({
  rows,
  compact = false,
}: {
  rows?: SellerCustomerHistoryItem[];
  compact?: boolean;
}) {
  const source = compact ? (rows ?? []).slice(0, 4) : (rows ?? []);
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
  );
}
function Customers() {
  const storeId = useSellerStoreId();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const filters = useMemo(
    () => ({
      q,
      page,
      pageSize,
    }),
    [q, page, pageSize],
  );

  const { data } = useSellerCustomers(storeId, filters);
  const pageRows = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const pageCount = Math.max(1, data?.pageCount ?? 1);
  const safePage = Math.min(Math.max(data?.page ?? page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const end = total === 0 ? 0 : Math.min(start + pageRows.length, total);

  return (
    <section className={`${sellerCard} overflow-hidden`}>
      <div className="hairline flex gap-3 border-b p-4">
        <SearchBox
          placeholder="Cari pelanggan..."
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
        <button className="hairline ml-auto rounded-xl border bg-white px-4 text-[10px] font-bold">
          Export CSV
        </button>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <MiniStat
          label="Total pelanggan"
          value={total ? String(total) : "—"}
          note="Dari pembelian toko"
        />
        <MiniStat
          label="Repeat buyers"
          value="—"
          note="Lihat detail per pelanggan"
        />
        <MiniStat label="Nilai rata-rata" value="—" note="per pelanggan" />
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
function CustomerDetail({ id }: { id: string }) {
  const storeId = useSellerStoreId();
  const { data: customer } = useSellerCustomer(storeId, id);
  const noteMutation = useUpsertSellerCustomerNote(storeId, id);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  if (!customer) return null;
  const o = customer;
  const noteValue = noteDraft ?? o.noteBody ?? "";
  const since = o.firstSeenDisplay || o.date;
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
              {o.email} • Customer since {since}
            </p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button className="hairline h-10 rounded-xl border bg-white px-4 text-[10px] font-bold">
              Kirim email
            </button>
            <button
              type="button"
              className="h-10 rounded-xl bg-[#173f2c] px-4 text-[10px] font-extrabold text-white"
              onClick={() => {
                const el = document.getElementById("customer-note-body");
                el?.focus();
              }}
            >
              Tambah catatan
            </button>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          <MiniStat
            label="Total belanja"
            value={rupiah(o.spent)}
            note="Lifetime value"
          />
          <MiniStat
            label="Pesanan"
            value={String(o.orders)}
            note="Semua pesanan"
          />
          <MiniStat
            label="Rata-rata order"
            value={rupiah(o.avgOrder ?? 0)}
            note="Per transaksi"
          />
          <MiniStat
            label="Produk dimiliki"
            value={String(o.productCount ?? 0)}
            note="Produk unik"
          />
        </div>
      </section>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className={`${sellerCard} overflow-hidden`}>
          <SectionHead
            title="Riwayat pembelian"
            desc="Semua produk yang dibeli pelanggan"
          />
          <OrderTable rows={o.history} compact />
        </section>
        <section className={`${sellerCard} p-5`}>
          <h3 className="text-xs font-extrabold">Catatan internal</h3>
          <textarea
            id="customer-note-body"
            rows={5}
            placeholder="Tulis catatan tentang pelanggan ini..."
            value={noteValue}
            onChange={(e) => setNoteDraft(e.target.value)}
            className="hairline mt-4 w-full resize-none rounded-xl border p-3 text-[10px] outline-none"
          />
          <button
            type="button"
            disabled={noteMutation.isPending}
            onClick={() => {
              noteMutation.mutate({
                body: noteValue,
                expectedVersion: o.noteVersion || undefined,
              });
            }}
            className="mt-3 h-10 w-full rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white"
          >
            Simpan catatan
          </button>
          <div className="hairline mt-5 border-t pt-5">
            <h4 className="text-[10px] font-extrabold">Marketing consent</h4>
            <p className="mt-1 text-[9px] text-[#748078]">
              {o.marketingConsentLabel || "Consent status not recorded"}
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
