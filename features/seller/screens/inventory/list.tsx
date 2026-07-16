"use client";

import Link from "next/link";
import { Boxes, ChevronRight, FileDown } from "lucide-react";
import { useSellerInventory } from "@/features/seller/inventory/hooks";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { FilterButton, MiniStat, SearchBox, sellerCard } from "./pieces";

export function Inventory() {
  const { data: stockProducts = [] } = useSellerInventory(DEMO_STORE_ID);
  const totalAvailable = stockProducts.reduce((sum, p) => sum + p.available, 0);
  const low = stockProducts.filter((p) => p.available <= p.lowAt).length;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat
          label="Stok tersedia"
          value={String(totalAvailable)}
          note="Siap dialokasikan"
        />
        <MiniStat label="Reserved" value="4" note="Checkout belum selesai" />
        <MiniStat label="Terjual" value="735" note="Lifetime fulfilled" />
        <MiniStat
          label="Stok menipis"
          value={String(low)}
          note="Perlu ditambah"
        />
      </div>
      <section className={`${sellerCard} mt-4 overflow-hidden`}>
        <div className="hairline flex flex-col gap-3 border-b p-4 sm:flex-row">
          <SearchBox placeholder="Cari produk stok..." />
          <div className="flex gap-2 sm:ml-auto">
            <FilterButton />
            <button className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold">
              <FileDown className="size-3.5" /> Export inventory
            </button>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          {stockProducts.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/inventory/${p.id}`}
              className="group hairline rounded-[20px] border bg-white p-5 transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex items-start">
                <span className="grid size-11 place-items-center rounded-xl bg-[#e9ff9b]">
                  <Boxes className="size-5" />
                </span>
                <span
                  className={`ml-auto rounded-full px-2.5 py-1.5 text-[8px] font-extrabold ${p.available <= p.lowAt ? "bg-[#fff4ce] text-[#8a6c22]" : "bg-[#e9f7ef] text-[#287d4c]"}`}
                >
                  {p.available <= p.lowAt ? "LOW STOCK" : "HEALTHY"}
                </span>
              </div>
              <h2 className="mt-6 text-sm font-extrabold">{p.title}</h2>
              <p className="mt-1 text-[9px] text-[#718078]">
                {p.type} • <code>{p.delivery}</code>
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  ["Available", p.available],
                  ["Reserved", p.reserved],
                  ["Sold", p.sold],
                ].map((x) => (
                  <div
                    key={x[0] as string}
                    className="rounded-xl bg-[#f3f4ef] p-3"
                  >
                    <span className="block text-[7px] tracking-wider text-[#7a867f] uppercase">
                      {x[0] as string}
                    </span>
                    <b className="mt-1 block text-sm">{x[1] as number}</b>
                  </div>
                ))}
              </div>
              <div className="hairline mt-5 flex items-center border-t pt-4 text-[9px] font-extrabold text-[#315d47]">
                Kelola inventory
                <ChevronRight className="ml-auto size-4 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
