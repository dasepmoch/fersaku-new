"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ProductArt } from "@/components/product-art";
import {
  useDebouncedProductSearch,
  useSellerProducts,
} from "@/features/catalog/hooks";
import { productStatusListLabel } from "@/features/catalog/mappers";
import { rupiah } from "@/lib/utils";
import { useSellerStoreId } from "@/shared/seller/current-store";
import { FilterButton, SearchBox, sellerCard } from "./pieces";

export function Products() {
  const storeId = useSellerStoreId();
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedProductSearch(query);
  const { data: products = [] } = useSellerProducts(storeId, {
    q: debouncedQ,
  });
  return (
    <section className={sellerCard}>
      <div className="hairline flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <SearchBox
          placeholder="Cari produk..."
          value={query}
          onChange={setQuery}
        />
        <div className="sm:ml-auto">
          <FilterButton />
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/products/${encodeURIComponent(p.id)}`}
            className="group hairline block rounded-[20px] border bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#173f2c]/30"
          >
            <ProductArt
              palette={p.palette}
              glyph={p.glyph}
              title={p.type}
              className="aspect-[1.5]"
            />
            <div className="p-2 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-extrabold">
                      {p.title}
                    </h3>
                    <span className="size-1.5 shrink-0 rounded-full bg-[#43a66d]" />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold tracking-wider text-[#7d8982] uppercase">
                    {p.type} • {productStatusListLabel(p.status)}
                  </p>
                </div>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-[#9aa39c] transition group-hover:text-[#173f2c]" />
              </div>
              <div className="hairline mt-4 flex items-center justify-between border-t pt-3">
                <b className="text-xs">{rupiah(p.price)}</b>
                <span className="text-[10px] font-bold text-[#758179]">
                  {p.sales} penjualan
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
