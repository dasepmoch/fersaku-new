"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  KeyRound,
  Laptop,
  Library,
  Link2,
  LogOut,
  Mail,
  MonitorSmartphone,
  PackageCheck,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import {
  buyerPurchases,
  buyerSessions,
  type BuyerPurchase,
} from "@/lib/buyer-mock-data";
import { rupiah } from "@/lib/utils";
import { ProductArt } from "@/components/product-art";

const card = "rounded-[24px] border hairline bg-white shadow-card";

export function PurchaseLibrary() {
  const [filter, setFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const filtered = buyerPurchases.filter(
    (p) =>
      (filter === "Semua" ||
        (filter === "Update tersedia" && p.updateAvailable) ||
        (filter === "File" && p.deliveryType === "download") ||
        (filter === "Akses & kode" && p.deliveryType !== "download")) &&
      (p.product.toLowerCase().includes(query.toLowerCase()) ||
        p.seller.toLowerCase().includes(query.toLowerCase())),
  );
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

export function PurchaseDetail({ purchase }: { purchase: BuyerPurchase }) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [updated, setUpdated] = useState(false);
  const copy = (value: string, label: string) => {
    navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1600);
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[1.12fr_.88fr]">
      <section className={`${card} p-5 sm:p-7`}>
        <div className="flex flex-col gap-5 sm:flex-row">
          <ProductArt
            palette={purchase.palette}
            glyph={purchase.glyph}
            className="size-24 shrink-0 !rounded-2xl"
          />
          <div>
            <p className="text-[10px] font-bold text-[#718078]">
              {purchase.seller}
            </p>
            <h2 className="font-display mt-2 text-4xl leading-none">
              {purchase.product}
            </h2>
            <p className="mt-3 text-[9px] text-[#718078]">
              Pesanan #{purchase.orderId} • {purchase.purchasedAt}
            </p>
          </div>
          <span className="h-fit rounded-full bg-[#e9f7ef] px-3 py-1.5 text-[8px] font-extrabold text-[#287d4c] sm:ml-auto">
            PAID
          </span>
        </div>
        {purchase.updateAvailable && purchase.sellerUpdatesEnabled && (
          <div className="mt-6 rounded-2xl border border-[#cde0a9] bg-[#f0f8dd] p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 text-[#4b6b2a]" />
              <div>
                <b className="text-[10px]">
                  Versi baru {purchase.updateAvailable} tersedia
                </b>
                <p className="mt-1 text-[8px] leading-4 text-[#687653]">
                  Seller mengaktifkan product updates untuk pembelian ini. File
                  terbaru tersedia tanpa biaya tambahan.
                </p>
              </div>
              <button
                onClick={() => setUpdated(true)}
                className="ml-auto shrink-0 rounded-lg bg-[#173f2c] px-3 py-2 text-[8px] font-extrabold text-white"
              >
                {updated ? "Sudah diperbarui" : "Gunakan versi baru"}
              </button>
            </div>
          </div>
        )}
        <div className="hairline mt-7 border-t pt-7">
          <h3 className="text-xs font-extrabold">Akses produk</h3>
          {purchase.deliveryType === "download" && purchase.downloads && (
            <div className="mt-4 rounded-2xl bg-[#eef3e9] p-5">
              <div className="flex items-center">
                <span className="grid size-11 place-items-center rounded-xl bg-white">
                  <FileDown className="size-5" />
                </span>
                <div className="ml-3">
                  <b className="block text-[10px]">
                    {purchase.downloads.fileName}
                  </b>
                  <span className="text-[8px] text-[#718078]">
                    {purchase.downloads.fileSize} • Versi{" "}
                    {updated ? purchase.updateAvailable : purchase.version}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDownloaded(true)}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white"
              >
                <Download className="size-4" />
                {downloaded
                  ? "Signed download dibuat • berlaku 5 menit"
                  : "Unduh file dengan aman"}
              </button>
              <div className="mt-3 flex justify-between text-[8px] text-[#718078]">
                <span>
                  {purchase.downloads.used} dari {purchase.downloads.max}{" "}
                  unduhan digunakan
                </span>
                <span>Link portal hingga {purchase.downloads.expiresAt}</span>
              </div>
            </div>
          )}
          {purchase.deliveryType === "link" && purchase.protectedLink && (
            <div className="mt-4 rounded-2xl bg-[#eef3e9] p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-white">
                  <Link2 className="size-5" />
                </span>
                <div>
                  <b className="block text-[10px]">
                    {purchase.protectedLink.label}
                  </b>
                  <span className="text-[8px] text-[#718078]">
                    {purchase.protectedLink.host} • Terakhir dibuka{" "}
                    {purchase.protectedLink.lastOpened}
                  </span>
                </div>
              </div>
              <button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-[10px] font-extrabold text-white">
                Buka akses terlindungi <ExternalLink className="size-4" />
              </button>
            </div>
          )}
          {purchase.deliveryType === "credentials" &&
            purchase.credentialFields && (
              <div className="mt-4 grid gap-3">
                {purchase.credentialFields.map((field, i) => (
                  <div
                    key={field.label}
                    className="hairline rounded-2xl border bg-[#f7f7f3] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-extrabold tracking-wider text-[#718078] uppercase">
                        {field.label}
                      </span>
                      {field.secret && (
                        <button
                          onClick={() =>
                            setRevealed({ ...revealed, [i]: !revealed[i] })
                          }
                          className="text-[#315d47]"
                        >
                          {revealed[i] ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex items-center">
                      <code className="min-w-0 flex-1 truncate text-[10px] font-bold">
                        {field.secret && !revealed[i]
                          ? "••••••••••••••••"
                          : field.value}
                      </code>
                      <button
                        onClick={() => copy(field.value, field.label)}
                        className="hairline ml-3 rounded-lg border bg-white p-2"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                    {copied === field.label && (
                      <p className="mt-2 text-[8px] font-bold text-[#2e714f]">
                        Disalin ke clipboard
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          {purchase.deliveryType === "code" && purchase.code && (
            <div className="hairline mt-4 rounded-2xl border bg-[#f7f7f3] p-5">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4" />
                <b className="text-[10px]">Kode produk pribadi</b>
                <span className="ml-auto rounded-full bg-[#fff4ce] px-2 py-1 text-[8px] font-bold text-[#8a6c22]">
                  {purchase.code.status}
                </span>
              </div>
              <div className="mt-4 flex rounded-xl border border-dashed border-[#173f2c]/25 bg-white p-4">
                <code className="flex-1 text-sm font-black tracking-[.08em]">
                  {purchase.code.value}
                </code>
                <button onClick={() => copy(purchase.code!.value, "code")}>
                  <Copy className="size-4" />
                </button>
              </div>
              <p className="mt-4 text-[9px] leading-5 text-[#718078]">
                {purchase.code.instructions}
              </p>
            </div>
          )}
        </div>
        <div className="hairline mt-7 flex flex-wrap gap-2 border-t pt-6">
          <button className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold">
            <Mail className="size-3.5" /> Kirim ulang email delivery
          </button>
          <Link
            href={`/account/purchases/${purchase.orderId}/invoice`}
            className="hairline flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-[9px] font-bold"
          >
            <Download className="size-3.5" /> Unduh Invoice PDF Resmi
          </Link>
        </div>
        <BuyerReviewCard product={purchase.product} />
      </section>
      <aside className="grid content-start gap-4">
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Ringkasan pesanan</h3>
          <div className="mt-5 grid gap-3">
            {[
              ["Status", "Paid"],
              ["Total", rupiah(purchase.price)],
              ["Pembayaran", "QRIS"],
              ["Email", "nadia@studio.id"],
              ["Order", purchase.orderId],
            ].map((x) => (
              <div key={x[0]} className="flex justify-between text-[9px]">
                <span className="text-[#718078]">{x[0]}</span>
                <b className="text-right">{x[1]}</b>
              </div>
            ))}
          </div>
        </section>
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Aktivitas delivery</h3>
          <div className="mt-4 grid gap-4">
            {[
              [Check, "Pembayaran dikonfirmasi", "12 Jul • 14:33"],
              [PackageCheck, "Produk tersedia", "12 Jul • 14:33"],
              [Mail, "Email terkirim", "12 Jul • 14:34"],
            ].map(([Icon, title, time]) => (
              <div key={title as string} className="flex gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#e9f5e7] text-[#2e714f]">
                  <Icon className="size-3" />
                </span>
                <div>
                  <b className="block text-[9px]">{title as string}</b>
                  <span className="text-[8px] text-[#718078]">
                    {time as string}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <Link
          href={`/@${purchase.sellerSlug}`}
          className={`${card} flex items-center p-4 text-[9px] font-extrabold`}
        >
          Lihat toko {purchase.seller}
          <ChevronRight className="ml-auto size-4" />
        </Link>
      </aside>
    </div>
  );
}

function BuyerReviewCard({ product }: { product: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [submitted, setSubmitted] = useState(false);
  if (submitted)
    return (
      <div className="mt-6 rounded-2xl border border-[#cde0a9] bg-[#eef8e4] p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[#d7ff64]">
            <Check className="size-4" />
          </span>
          <div>
            <b className="block text-[10px]">Ulasanmu sudah dikirim</b>
            <span className="text-[8px] text-[#65736b]">
              Ulasan terverifikasi akan tampil setelah pemeriksaan otomatis.
            </span>
          </div>
        </div>
      </div>
    );
  return (
    <div className="hairline mt-6 rounded-2xl border bg-[#f7f7f3] p-5">
      <div className="flex items-center">
        <div>
          <b className="block text-[10px]">Bagaimana pengalamanmu?</b>
          <span className="mt-1 block text-[8px] text-[#718078]">
            Ulasan hanya tersedia untuk pembelian terverifikasi.
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="hairline ml-auto rounded-lg border bg-white px-3 py-2 text-[8px] font-bold"
        >
          {open ? "Tutup" : "Tulis ulasan"}
        </button>
      </div>
      {open && (
        <div className="hairline mt-5 border-t pt-5">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} onClick={() => setRating(star)}>
                <Star
                  className={`size-6 text-[#e8a72e] ${star <= rating ? "fill-current" : "opacity-25"}`}
                />
              </button>
            ))}
          </div>
          <input
            placeholder="Judul singkat"
            className="hairline mt-4 h-10 w-full rounded-xl border bg-white px-3 text-[9px] outline-none"
          />
          <textarea
            rows={4}
            placeholder={`Ceritakan pengalamanmu menggunakan ${product}...`}
            className="hairline mt-3 w-full resize-none rounded-xl border bg-white p-3 text-[9px] outline-none"
          />
          <label className="mt-3 flex items-center gap-2 text-[8px] text-[#718078]">
            <input type="checkbox" /> Tampilkan nama sebagai anonim
          </label>
          <button
            onClick={() => setSubmitted(true)}
            className="mt-4 h-10 w-full rounded-xl bg-[#173f2c] text-[9px] font-extrabold text-white"
          >
            Kirim ulasan {rating} bintang
          </button>
        </div>
      )}
    </div>
  );
}

export function BuyerProfile() {
  const [saved, setSaved] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [updates, setUpdates] = useState(true);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} p-5 sm:p-7`}>
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full bg-[#ffb69d] text-sm font-black">
            NP
          </span>
          <div>
            <h2 className="text-lg font-extrabold">Nadia Putri</h2>
            <p className="mt-1 text-[9px] text-[#718078]">
              Buyer sejak 18 Maret 2026
            </p>
          </div>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <ProfileField label="Nama lengkap" value="Nadia Putri" />
          <ProfileField label="Email utama" value="nadia@studio.id" />
          <ProfileField label="Nomor telepon" value="+62 812 3456 7890" />
          <ProfileField label="Bahasa" value="Bahasa Indonesia" />
        </div>
        <div className="hairline mt-7 border-t pt-6">
          <h3 className="text-xs font-extrabold">Preferensi email</h3>
          <div className="mt-4 grid gap-3">
            <Preference
              title="Receipt dan akses pembelian"
              desc="Wajib untuk transaksi dan tidak dapat dinonaktifkan."
              value
            />
            <Preference
              title="Update produk dari seller"
              desc="Hanya untuk produk yang seller tandai memiliki update."
              value={updates}
              onChange={() => setUpdates(!updates)}
            />
            <Preference
              title="Rekomendasi dan marketing"
              desc="Penawaran opsional dari seller yang pernah kamu beli."
              value={marketing}
              onChange={() => setMarketing(!marketing)}
            />
          </div>
        </div>
        <button
          onClick={() => setSaved(true)}
          className="mt-7 h-11 rounded-xl bg-[#173f2c] px-5 text-[10px] font-extrabold text-white"
        >
          {saved ? "Profil berhasil disimpan" : "Simpan perubahan"}
        </button>
      </section>
      <aside className={`${card} h-fit p-5`}>
        <UserRound className="size-5 text-[#315d47]" />
        <h3 className="mt-5 text-xs font-extrabold">Tentang identitas buyer</h3>
        <p className="mt-2 text-[9px] leading-5 text-[#718078]">
          Pembelian dari email yang sama digabung setelah email diverifikasi.
          Seller hanya dapat melihat transaksi dari tokonya sendiri.
        </p>
        <div className="mt-5 rounded-xl bg-[#eef3e9] p-4 text-[8px] leading-4 text-[#65736b]">
          Mengubah email utama memerlukan verifikasi ke alamat lama dan baru.
        </div>
        <button className="hairline mt-4 h-10 w-full rounded-xl border text-[9px] font-bold">
          Mulai perubahan email
        </button>
      </aside>
    </div>
  );
}

export function BuyerSecurity() {
  const [sessions, setSessions] = useState(buyerSessions);
  const revoke = (id: string) =>
    setSessions((current) => current.filter((s) => s.id !== id));
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${card} overflow-hidden`}>
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#e9ff9b]">
              <MonitorSmartphone className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">Perangkat & sesi aktif</h2>
              <p className="mt-1 text-[9px] text-[#718078]">
                Cabut akses perangkat yang tidak dikenali.
              </p>
            </div>
            <button
              onClick={() =>
                setSessions((current) => current.filter((s) => s.current))
              }
              className="hairline ml-auto hidden rounded-xl border px-3 py-2 text-[8px] font-bold sm:block"
            >
              Keluar dari perangkat lain
            </button>
          </div>
        </div>
        <div>
          {sessions.map((session) => (
            <div
              key={session.id}
              className="hairline flex items-center gap-3 border-t px-5 py-4 sm:px-7"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-[#eef0eb]">
                {session.device.includes("Android") ||
                session.device.includes("iPhone") ? (
                  <Smartphone className="size-4" />
                ) : (
                  <Laptop className="size-4" />
                )}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <b className="text-[10px]">{session.device}</b>
                  {session.current && (
                    <span className="rounded-full bg-[#e9f7ef] px-2 py-0.5 text-[7px] font-extrabold text-[#287d4c]">
                      PERANGKAT INI
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[8px] text-[#718078]">
                  {session.location} • {session.ip} • {session.active}
                </p>
              </div>
              {!session.current && (
                <button
                  onClick={() => revoke(session.id)}
                  className="ml-auto text-[8px] font-extrabold text-[#b2573c]"
                >
                  Cabut sesi
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <aside className="grid content-start gap-4">
        <section className={`${card} p-5`}>
          <ShieldCheck className="size-5 text-[#315d47]" />
          <h3 className="mt-5 text-xs font-extrabold">Passwordless account</h3>
          <p className="mt-2 text-[9px] leading-5 text-[#718078]">
            Login menggunakan magic link satu kali yang berlaku 15 menit. Tidak
            ada password yang disimpan.
          </p>
        </section>
        <section className={`${card} p-5`}>
          <h3 className="text-xs font-extrabold">Aktivitas keamanan</h3>
          <div className="mt-4 grid gap-4">
            {[
              ["Magic link digunakan", "Hari ini, 09:42"],
              ["Sesi Android dibuat", "Hari ini, 09:43"],
              ["Email diverifikasi", "18 Mar 2026"],
            ].map((x) => (
              <div key={x[0]}>
                <b className="block text-[9px]">{x[0]}</b>
                <span className="text-[8px] text-[#718078]">{x[1]}</span>
              </div>
            ))}
          </div>
        </section>
        <button className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#efc8c0] bg-[#fff5f4] text-[9px] font-extrabold text-[#a44f3b]">
          <LogOut className="size-4" /> Keluar dari semua sesi
        </button>
      </aside>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2 text-[10px] font-extrabold">
      {label}
      <input
        defaultValue={value}
        className="hairline h-11 rounded-xl border bg-white px-3 text-[10px] font-normal outline-none"
      />
    </label>
  );
}
function Preference({
  title,
  desc,
  value,
  onChange,
}: {
  title: string;
  desc: string;
  value: boolean;
  onChange?: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[#f5f5f0] p-4">
      <div>
        <b className="block text-[9px]">{title}</b>
        <span className="mt-1 block text-[8px] text-[#718078]">{desc}</span>
      </div>
      <button
        disabled={!onChange}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-full ${value ? "bg-[#173f2c]" : "bg-[#c9cec9]"} disabled:opacity-60`}
      >
        <span
          className={`absolute top-1 size-4 rounded-full bg-white transition ${value ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}
