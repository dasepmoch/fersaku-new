"use client";

import { MoreHorizontal } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import { useSellerProducts } from "@/features/catalog/hooks";
import { rupiah } from "@/lib/utils";
import { useSellerStoreId } from "@/shared/seller/current-store";
import { FilterButton, SearchBox, sellerCard } from "./pieces";

export function Products() {
  const storeId = useSellerStoreId();
  const { data: products = [] } = useSellerProducts(storeId);
  return (
    <section className={sellerCard}>
      <div className="hairline flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <SearchBox placeholder="Cari produk..." />
        <div className="sm:ml-auto">
          <FilterButton />
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <article
            key={p.id}
            className="group hairline rounded-[20px] border bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <ProductArt
              palette={p.palette}
              glyph={p.glyph}
              title={p.type}
              className="aspect-[1.5]"
            />
            <div className="p-2 pt-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-extrabold">
                      {p.title}
                    </h3>
                    <span className="size-1.5 shrink-0 rounded-full bg-[#43a66d]" />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold tracking-wider text-[#7d8982] uppercase">
                    {p.type} • Published
                  </p>
                </div>
                <button>
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
              <div className="hairline mt-4 flex items-center justify-between border-t pt-3">
                <b className="text-xs">{rupiah(p.price)}</b>
                <span className="text-[10px] font-bold text-[#758179]">
                  {p.sales} penjualan
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
