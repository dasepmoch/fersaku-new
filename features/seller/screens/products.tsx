"use client";

import Link from "next/link";
import {
  Boxes,
  Download,
  Eye,
  Filter,
  KeyRound,
  Link2,
  LockKeyhole,
  MoreHorizontal,
  Search,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { ProductArt } from "@/components/product-art";
import {
  useSellerProduct,
  useSellerProducts,
} from "@/features/catalog/hooks";
import { products as fallbackProducts } from "@/lib/mock-data";
import { compactRupiah, rupiah } from "@/lib/utils";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { surfaceCard } from "@/shared/ui/styles";

const card = surfaceCard;
function Products() {
  const { data: products = fallbackProducts } = useSellerProducts(DEMO_STORE_ID);
  return (
    <section className={card}>
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
function ProductForm() {
  const [type, setType] = useState("download");
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} p-5 sm:p-7`}>
        <div className="grid gap-6">
          <FormGroup
            label="Informasi produk"
            desc="Informasi utama yang dilihat pembeli."
          >
            <div className="grid gap-4">
              <Input label="Nama produk" placeholder="Contoh: AI Prompt Pack" />
              <Input
                label="Slug"
                placeholder="ai-prompt-pack"
                prefix="fersaku.id/@asep/"
              />
              <label className="grid gap-2 text-xs font-bold">
                Deskripsi
                <textarea
                  rows={5}
                  className="ring-focus hairline resize-none rounded-xl border bg-white p-4 text-sm font-normal outline-none"
                  placeholder="Ceritakan manfaat produkmu..."
                />
              </label>
            </div>
          </FormGroup>
          <FormGroup
            label="Jenis pengiriman"
            desc="Pilih bagaimana produk diberikan setelah pembayaran."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["download", Download, "File download"],
                ["link", Link2, "Protected link"],
                ["code", KeyRound, "Stock code"],
                ["credentials", Boxes, "Akun / credentials"],
              ].map(([id, Icon, label]) => (
                <button
                  key={id as string}
                  onClick={() => setType(id as string)}
                  className={`rounded-2xl border p-4 text-left transition ${type === id ? "border-[#173f2c] bg-[#eef3e9] ring-1 ring-[#173f2c]" : "hairline bg-white hover:bg-[#f6f6f2]"}`}
                >
                  <Icon className="size-5" />
                  <b className="mt-5 block text-xs">{label as string}</b>
                </button>
              ))}
            </div>
            {type === "download" && (
              <div className="mt-4 rounded-2xl border border-dashed border-[#173f2c]/20 bg-[#f7f7f3] p-7 text-center">
                <Upload className="mx-auto size-6 text-[#65736b]" />
                <p className="mt-3 text-xs font-extrabold">
                  Tarik file ke sini atau pilih dari perangkat
                </p>
                <p className="mt-1 text-[10px] text-[#87918b]">
                  ZIP, PDF, PNG hingga 2 GB
                </p>
                <button className="hairline mt-4 rounded-lg border bg-white px-3 py-2 text-[10px] font-bold">
                  Pilih file
                </button>
              </div>
            )}
            {type === "link" && (
              <div className="hairline mt-4 grid gap-4 rounded-2xl border bg-[#f7f7f3] p-5">
                <Input
                  label="Protected delivery URL"
                  placeholder="https://notion.so/your-template"
                />
                <p className="text-[8px] leading-4 text-[#718078]">
                  URL asli hanya diberikan setelah pembayaran dan tidak tampil
                  di storefront.
                </p>
              </div>
            )}
            {type === "code" && (
              <div className="hairline mt-4 rounded-2xl border bg-[#f7f7f3] p-5">
                <label className="grid gap-2 text-[9px] font-bold">
                  Paste stock codes
                  <textarea
                    rows={5}
                    placeholder={"CODE-001\nCODE-002\nCODE-003"}
                    className="hairline rounded-xl border bg-white p-3 font-mono text-[9px] font-normal outline-none"
                  />
                </label>
                <p className="mt-3 text-[8px] text-[#718078]">
                  Satu kode per baris. Setiap paid order mengonsumsi tepat satu
                  kode secara atomik.
                </p>
              </div>
            )}
            {type === "credentials" && (
              <div className="mt-4 rounded-2xl border border-[#cde0a9] bg-[#eff6df] p-5">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="size-4 text-[#486027]" />
                  <div>
                    <b className="block text-[10px]">
                      Structured credential inventory
                    </b>
                    <p className="mt-1 text-[8px] leading-4 text-[#687653]">
                      Buat field seperti username, password, PIN, team link,
                      atau expiry. Secret dienkripsi dan hanya dibuka saat
                      fulfillment.
                    </p>
                  </div>
                </div>
                <code className="mt-4 block rounded-xl bg-[#173f2c] p-3 text-[9px] font-bold text-[#d7ff64]">
                  username|password|team_link
                </code>
                <Link
                  href="/dashboard/inventory/prod_account"
                  className="mt-4 inline-flex text-[9px] font-extrabold text-[#315d47]"
                >
                  Buka schema & inventory editor →
                </Link>
              </div>
            )}
          </FormGroup>
          <FormGroup label="Harga" desc="Gunakan nominal dalam Rupiah.">
            <Input label="Harga produk" placeholder="79.000" prefix="Rp" />
          </FormGroup>
        </div>
      </section>
      <aside>
        <div className={`${card} sticky top-28 p-5`}>
          <p className="text-[10px] font-extrabold tracking-wider text-[#7b8780] uppercase">
            Preview
          </p>
          <ProductArt
            palette="#e9ff9b"
            glyph="AI"
            className="mt-4 aspect-[1.25]"
          />
          <h3 className="mt-4 text-sm font-extrabold">Produk tanpa judul</h3>
          <p className="mt-1 text-xs text-[#7a867f]">Rp0</p>
          <div className="mt-5 grid gap-2">
            <button className="h-11 rounded-xl bg-[#173f2c] text-xs font-extrabold text-white">
              Simpan & publikasikan
            </button>
            <button className="hairline h-11 rounded-xl border bg-white text-xs font-bold">
              Simpan sebagai draft
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
function ProductDetail({ id }: { id: string }) {
  const { data: product } = useSellerProduct(DEMO_STORE_ID, id);
  const p = product || fallbackProducts[0];
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
  const publishRelease = () => {
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
    setTimeout(() => setPublished(false), 2400);
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} overflow-hidden`}>
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
        <div className={`${card} p-5`}>
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
        <div className={`${card} border-[#efc8c0] p-5`}>
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
function FilterButton() {
  return (
    <button className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[10px] font-bold">
      <Filter className="size-3.5" /> Filter
    </button>
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
function FormGroup({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hairline border-b pb-7 last:border-0">
      <div className="mb-5">
        <h2 className="text-sm font-extrabold">{label}</h2>
        <p className="mt-1 text-[10px] text-[#7b8780]">{desc}</p>
      </div>
      {children}
    </div>
  );
}
function Input({
  label,
  placeholder,
  prefix,
  value,
}: {
  label: string;
  placeholder?: string;
  prefix?: string;
  value?: string;
}) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <div className="hairline flex h-12 overflow-hidden rounded-xl border bg-white">
        {prefix && (
          <span className="hairline flex items-center border-r bg-[#f3f4ef] px-3 text-[10px] font-semibold text-[#77837b]">
            {prefix}
          </span>
        )}
        <input
          defaultValue={value}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-4 text-sm font-normal outline-none"
        />
      </div>
    </label>
  );
}
function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="grid gap-2 text-xs font-bold">
      {label}
      <select className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none">
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}

export {
  Products as SellerProductsScreen,
  ProductForm as SellerProductFormScreen,
  ProductDetail as SellerProductDetailScreen,
};
