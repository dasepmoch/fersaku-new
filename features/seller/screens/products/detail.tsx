"use client";

import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProductArt } from "@/components/product-art";
import {
  usePublishSellerProductMutation,
  useSellerProduct,
} from "@/features/catalog/hooks";
import { compactRupiah, rupiah } from "@/lib/utils";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import {
  FormGroup,
  Input,
  MiniStat,
  Select,
  Status,
  sellerCard,
} from "./pieces";

export function ProductDetail({ id }: { id: string }) {
  const { data: product } = useSellerProduct(DEMO_STORE_ID, id);
  const publishMutation = usePublishSellerProductMutation();
  const [tab, setTab] = useState("Detail");
  const [archived, setArchived] = useState(false);
  const [updatesEnabled, setUpdatesEnabled] = useState(true);
  const [releases, setReleases] = useState([
    {
      version: "v3.0",
      notes: "20 prompt riset baru dan Notion workspace yang lebih rapi.",
      date: "2 Jul 2026",
      buyers: 428,
    },
    {
      version: "v2.5",
      notes: "Formula prompt untuk image generation dan video.",
      date: "18 Mei 2026",
      buyers: 361,
    },
  ]);
  const [published, setPublished] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const publishRelease = async () => {
    try {
      await publishMutation.mutateAsync({
        storeId: DEMO_STORE_ID,
        productId: id,
        reason: "seller_product_release_publish",
      });
    } catch {
      return;
    }
    const current = Number(releases[0].version.replace("v", ""));
    const version = `v${(current + 0.1).toFixed(1)}`;
    setReleases((old) => [
      {
        version,
        notes:
          "Perbaikan struktur, bonus prompt, dan template workflow terbaru.",
        date: "Baru saja",
        buyers: 428,
      },
      ...old,
    ]);
    setPublished(true);
    timer.current = setTimeout(() => setPublished(false), 2400);
  };
  if (!product) return null;
  const p = product;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${sellerCard} overflow-hidden`}>
        <div className="hairline flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center">
          <ProductArt
            palette={p.palette}
            glyph={p.glyph}
            className="size-20 shrink-0 !rounded-2xl"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold">{p.title}</h2>
              <Status status={archived ? "Archived" : "Active"} />
            </div>
            <p className="mt-1 text-[10px] text-[#7a867f]">
              {p.id} • fersaku.id/@asep/{p.slug}
            </p>
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Link
              href={`/@asep-ai-tools/${p.slug}`}
              className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold"
            >
              <Eye className="size-3.5" /> Preview
            </Link>
            <button className="flex h-10 items-center gap-2 rounded-xl bg-[#173f2c] px-4 text-[10px] font-extrabold text-white">
              Simpan perubahan
            </button>
          </div>
        </div>
        <div className="hairline flex overflow-x-auto border-b px-5">
          {["Detail", "Delivery", "Pricing", "Checkout", "Analytics"].map(
            (x) => (
              <button
                key={x}
                onClick={() => setTab(x)}
                className={`border-b-2 px-4 py-4 text-[10px] font-extrabold ${tab === x ? "border-[#173f2c]" : "border-transparent text-[#819087]"}`}
              >
                {x}
              </button>
            ),
          )}
        </div>
        <div className="p-5 sm:p-7">
          {tab === "Analytics" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <MiniStat
                label="Total penjualan"
                value={String(p.sales)}
                note="Sepanjang waktu"
              />
              <MiniStat
                label="Pendapatan"
                value={compactRupiah(p.sales * p.price)}
                note="Gross revenue"
              />
              <MiniStat
                label="Conversion"
                value="9,2%"
                note="Dari 4.652 views"
              />
            </div>
          ) : tab === "Delivery" ? (
            <div>
              <h3 className="text-sm font-extrabold">File delivery</h3>
              <div className="hairline mt-4 flex items-center gap-4 rounded-2xl border bg-white p-4">
                <span className="grid size-11 place-items-center rounded-xl bg-[#edf1e9]">
                  <Download className="size-5" />
                </span>
                <div>
                  <b className="block text-xs">ai-prompt-pack-v3.zip</b>
                  <span className="text-[9px] text-[#7a867f]">
                    48.2 MB • Updated 2 Jul 2026
                  </span>
                </div>
                <button className="ml-auto text-[10px] font-bold text-[#315d47]">
                  Replace file
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input label="Download expiry" value="7 days" />
                <Input label="Maximum downloads" value="5" />
              </div>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#f5f5f0] p-4">
                <div>
                  <b className="block text-[10px]">
                    Product updates untuk pembeli lama
                  </b>
                  <span className="mt-1 block text-[8px] leading-4 text-[#718078]">
                    Jika aktif, seller dapat menerbitkan versi baru dan buyer
                    portal akan menampilkan update. Tidak ada notifikasi jika
                    seller tidak menerbitkan versi.
                  </span>
                </div>
                <button
                  onClick={() => setUpdatesEnabled(!updatesEnabled)}
                  className={`relative ml-4 h-6 w-11 shrink-0 rounded-full ${updatesEnabled ? "bg-[#173f2c]" : "bg-[#c9cec9]"}`}
                >
                  <span
                    className={`absolute top-1 size-4 rounded-full bg-white transition ${updatesEnabled ? "left-6" : "left-1"}`}
                  />
                </button>
              </div>
              {updatesEnabled && (
                <div className="hairline mt-4 grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-2">
                  <Input
                    label="Current public version"
                    value={releases[0].version}
                  />
                  <Input
                    label="Release notes URL"
                    value="fersaku.id/updates/prod_01"
                  />
                  <label className="grid gap-2 text-[9px] font-bold sm:col-span-2">
                    Catatan versi
                    <textarea
                      rows={3}
                      defaultValue="Tambahan 20 prompt riset dan perbaikan struktur Notion workspace."
                      className="hairline rounded-xl border p-3 text-[9px] font-normal outline-none"
                    />
                  </label>
                  <button
                    onClick={publishRelease}
                    className="h-10 rounded-xl bg-[#173f2c] text-[9px] font-extrabold text-white sm:col-span-2"
                  >
                    {published
                      ? `Published ${releases[0].version} • 428 buyers notified`
                      : "Publish update to existing buyers"}
                  </button>
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-[9px] font-extrabold">
                      Release history
                    </p>
                    {releases.map((release) => (
                      <div
                        key={`${release.version}-${release.date}`}
                        className="hairline flex gap-3 border-t py-3 first:border-0"
                      >
                        <span className="h-fit rounded-lg bg-[#e9ff9b] px-2 py-1 text-[8px] font-black text-[#173f2c]">
                          {release.version}
                        </span>
                        <div>
                          <b className="block text-[9px]">{release.notes}</b>
                          <span className="mt-1 block text-[8px] text-[#718078]">
                            {release.date} • available to {release.buyers}{" "}
                            verified buyers
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-6">
              <FormGroup
                label="Informasi produk"
                desc="Konten yang terlihat di halaman produk."
              >
                <div className="grid gap-4">
                  <Input label="Nama produk" value={p.title} />
                  <Input
                    label="Slug"
                    value={p.slug}
                    prefix="fersaku.id/@asep/"
                  />
                  <label className="grid gap-2 text-xs font-bold">
                    Deskripsi
                    <textarea
                      defaultValue={p.description}
                      rows={5}
                      className="hairline rounded-xl border bg-white p-4 text-sm font-normal outline-none"
                    />
                  </label>
                </div>
              </FormGroup>
              <FormGroup
                label="Harga & status"
                desc="Atur harga dan visibilitas produk."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Harga" value={String(p.price)} prefix="Rp" />
                  <Select
                    label="Status"
                    options={[
                      archived ? "Archived" : "Published",
                      "Draft",
                      "Archived",
                    ]}
                  />
                </div>
              </FormGroup>
            </div>
          )}
        </div>
      </section>
      <aside className="grid content-start gap-4">
        <div className={`${sellerCard} p-5`}>
          <h3 className="text-xs font-extrabold">Ringkasan produk</h3>
          <div className="mt-5 grid gap-3">
            {[
              ["Jenis", p.type],
              ["Terjual", String(p.sales)],
              ["Harga", rupiah(p.price)],
              ["Dibuat", "18 Mar 2026"],
              ["Terakhir diubah", "2 Jul 2026"],
            ].map((x) => (
              <div key={x[0]} className="flex justify-between text-[10px]">
                <span className="text-[#748078]">{x[0]}</span>
                <b className="capitalize">{x[1]}</b>
              </div>
            ))}
          </div>
        </div>
        <div className={`${sellerCard} border-[#efc8c0] p-5`}>
          <h3 className="text-xs font-extrabold text-[#a44f3b]">Danger zone</h3>
          <p className="mt-2 text-[9px] leading-4 text-[#85736e]">
            Arsipkan produk agar tidak bisa dibeli tanpa menghapus data
            penjualan.
          </p>
          <button
            onClick={() => setArchived(!archived)}
            className="mt-4 h-10 w-full rounded-xl border border-[#efc8c0] bg-[#fff6f2] text-[10px] font-extrabold text-[#a44f3b]"
          >
            {archived ? "Pulihkan produk" : "Arsipkan produk"}
          </button>
        </div>
      </aside>
    </div>
  );
}
