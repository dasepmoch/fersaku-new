"use client";

import Link from "next/link";
import { ChevronRight, Library, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { useBuyerPurchases } from "@/features/buyer/data";
import { ProductArt } from "@/components/product-art";

const card = "rounded-[24px] border hairline bg-white shadow-card";

export function PurchaseLibrary() {
  const [filter, setFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const { data } = useBuyerPurchases({
    q: query,
    filter: filter as "Semua" | "File" | "Akses & kode" | "Update tersedia",
  });
  const filtered = data ?? [];
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="hairline flex h-11 flex-1 items-center gap-2 rounded-xl border bg-white px-3">
          <Search className="size-4 text-[#718078]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk, seller, atau nomor pesanan..."
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </div>
        <div className="hairline flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">
          {["Semua", "File", "Akses & kode", "Update tersedia"].map((x) => (
            <button
              key={x}
              onClick={() => setFilter(x)}
              className={`rounded-lg px-3 py-2 text-[9px] font-extrabold whitespace-nowrap ${filter === x ? "bg-[#173f2c] text-white" : "text-[#718078]"}`}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link
              href={`/account/purchases/${p.orderId}`}
              key={p.orderId}
              className={`${card} group overflow-hidden p-3 transition hover:-translate-y-1`}
            >
              <div className="relative">
                <ProductArt
                  palette={p.palette}
                  glyph={p.glyph}
                  title={p.deliveryType}
                  className="aspect-[1.35]"
                />
                {p.updateAvailable && p.sellerUpdatesEnabled && (
                  <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-[#173f2c] px-3 py-1.5 text-[8px] font-extrabold text-[#d7ff64]">
                    <Sparkles className="size-3" /> UPDATE {p.updateAvailable}
                  </span>
                )}
              </div>
              <div className="p-3 pb-4">
                <p className="text-[9px] font-bold text-[#718078]">
                  {p.seller}
                </p>
                <h2 className="mt-1 text-sm font-extrabold">{p.product}</h2>
                <div className="hairline mt-5 flex items-center border-t pt-4">
                  <span className="text-[9px] text-[#718078]">
                    Dibeli {p.purchasedAt.split(",")[0]}
                  </span>
                  <ChevronRight className="ml-auto size-4 transition group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={`${card} mt-6 p-12 text-center`}>
          <Library className="mx-auto size-8 text-[#87918b]" />
          <h2 className="mt-4 text-sm font-extrabold">
            Tidak ada pembelian ditemukan
          </h2>
          <p className="mt-2 text-[10px] text-[#718078]">
            Coba gunakan kata kunci atau filter lain.
          </p>
        </div>
      )}
    </>
  );
}
