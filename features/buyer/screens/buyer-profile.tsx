"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";
import { Preference, ProfileField } from "./pieces";

const card = "rounded-[24px] border hairline bg-white shadow-card";

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
