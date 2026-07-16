"use client";

import Link from "next/link";
import {
  Boxes,
  Download,
  KeyRound,
  Link2,
  LockKeyhole,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { ProductArt } from "@/components/product-art";
import { FormGroup, Input, sellerCard } from "./pieces";

export function ProductForm() {
  const [type, setType] = useState("download");
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className={`${sellerCard} p-5 sm:p-7`}>
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
        <div className={`${sellerCard} sticky top-28 p-5`}>
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
