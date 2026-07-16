"use client";

import Link from "next/link";
import { Check, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useSellerFinanceSummary } from "@/features/finance/hooks";
import { DEMO_STORE_ID } from "@/shared/config/demo";
import { rupiah } from "@/shared/format/money";
import { FieldInput, FormGroup } from "@/shared/ui/form-controls";
import { surfaceCard } from "@/shared/ui/styles";

export function WithdrawalForm() {
  const [submitted, setSubmitted] = useState(false);
  const { data: summary } = useSellerFinanceSummary(DEMO_STORE_ID);
  const available = summary?.availableAmount ?? 18_240_500;
  const requestAmount = 5_000_000;

  if (submitted)
    return (
      <div className={`${surfaceCard} mx-auto max-w-xl p-8 text-center`}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#d7ff64]">
          <Check className="size-7" />
        </span>
        <h2 className="font-display mt-5 text-4xl">Penarikan diajukan.</h2>
        <p className="mt-3 text-xs leading-5 text-[#6d7972]">
          {rupiah(requestAmount)} sedang menunggu review. Kamu akan menerima
          update melalui email.
        </p>
        <Link
          href="/dashboard/withdrawals"
          className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#173f2c] px-5 text-[10px] font-extrabold text-white"
        >
          Kembali ke riwayat
        </Link>
      </div>
    );
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className={`${surfaceCard} p-5 sm:p-7`}>
        <div className="mb-6 flex gap-3 rounded-2xl border border-[#e5c66d] bg-[#fff7dc] p-4 text-[#684f13]">
          <LockKeyhole className="mt-0.5 size-5 shrink-0" />
          <div>
            <b className="text-xs">Pengajuan belum dapat diproses</b>
            <p className="mt-1 text-[9px] leading-4">
              Rekening tujuan baru saja diubah. Demi keamanan saldo, form tetap
              dapat ditinjau tetapi tombol pengajuan aktif kembali pada 13 Jul
              2026, 14:42 WIB.
            </p>
          </div>
        </div>
        <FormGroup
          label="Jumlah penarikan"
          desc="Dana akan dikunci selama proses review."
        >
          <FieldInput label="Nominal" value="5000000" prefix="Rp" />
          <div className="mt-3 flex justify-between text-[9px] text-[#748078]">
            <span>Minimum Rp50.000</span>
            <button className="font-extrabold text-[#315d47]">
              Tarik semua {rupiah(available)}
            </button>
          </div>
        </FormGroup>
        <FormGroup
          label="Rekening tujuan"
          desc="Pastikan nama pemilik rekening sama dengan identitas akun."
        >
          <div className="rounded-2xl border-2 border-[#173f2c] bg-[#eff3e9] p-4">
            <div className="flex items-center">
              <span className="grid size-10 place-items-center rounded-xl bg-white font-black text-[#2855a5]">
                BCA
              </span>
              <div className="ml-3">
                <b className="block text-xs">Bank Central Asia • 4821</b>
                <span className="text-[9px] text-[#748078]">ASEP KURNIA</span>
              </div>
              <span className="ml-auto grid size-5 place-items-center rounded-full border-[5px] border-[#173f2c] bg-white" />
            </div>
          </div>
          <button className="mt-3 text-[9px] font-bold text-[#315d47]">
            + Tambah rekening lain
          </button>
        </FormGroup>
        <FormGroup
          label="Konfirmasi keamanan"
          desc="Penarikan memerlukan verifikasi akun."
        >
          <label className="grid gap-2 text-xs font-bold">
            Password akun
            <input
              type="password"
              placeholder="Masukkan password"
              className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none"
            />
          </label>
        </FormGroup>
        <button
          disabled
          onClick={() => setSubmitted(true)}
          className="h-12 w-full cursor-not-allowed rounded-xl bg-[#d9c98f] text-xs font-extrabold text-[#6f5c25]"
        >
          <LockKeyhole className="mr-2 inline size-4" /> Terkunci hingga 13 Jul,
          14:42 WIB
        </button>
      </section>
      <aside>
        <div className={`${surfaceCard} sticky top-28 p-5`}>
          <h3 className="text-xs font-extrabold">Ringkasan</h3>
          <div className="mt-5 grid gap-3 text-[10px]">
            {[
              ["Saldo tersedia", rupiah(available)],
              ["Jumlah ditarik", rupiah(requestAmount)],
              ["Biaya penarikan", "Rp0"],
              ["Sisa saldo", rupiah(available - requestAmount)],
            ].map((x, i) => (
              <div
                key={x[0]}
                className={`flex justify-between ${i === 3 ? "hairline border-t pt-3 font-extrabold" : ""}`}
              >
                <span className="text-[#748078]">{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-[#fff5d8] p-4 text-[9px] leading-4 text-[#75643c]">
            Estimasi dana masuk 1 hari kerja setelah disetujui.
          </div>
        </div>
      </aside>
    </div>
  );
}
