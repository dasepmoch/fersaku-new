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
  Link2,
  Mail,
  PackageCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import type { BuyerPurchase } from "@/features/buyer/data";
import { rupiah } from "@/lib/utils";
import { ProductArt } from "@/components/product-art";
import { BuyerReviewCard } from "./pieces";

const card = "rounded-[24px] border hairline bg-white shadow-card";

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
