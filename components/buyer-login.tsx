"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "./brand";
import { ThemeToggle } from "./theme-provider";

export function BuyerLogin() {
  const [email, setEmail] = useState("nadia@studio.id");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 700);
  };
  return (
    <main className="grid min-h-screen bg-[#f8f7f2] lg:grid-cols-[.9fr_1.1fr]">
      <section className="flex min-h-screen flex-col p-5 sm:p-8 lg:p-12">
        <div className="flex items-center">
          <Logo />
          <ThemeToggle className="ml-auto" />
        </div>
        <div className="mx-auto my-auto w-full max-w-[430px] py-12">
          {sent ? (
            <div className="text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#d7ff64]">
                <Mail className="size-6" />
              </span>
              <h1 className="font-display mt-6 text-5xl leading-none">
                Cek emailmu.
              </h1>
              <p className="mt-4 text-xs leading-6 text-[#718078]">
                Jika <b>{email}</b> memiliki pembelian, kami telah mengirim
                magic link yang berlaku selama 15 menit.
              </p>
              <Link
                href="/account/verify?token=mock_buyer_token"
                className="mt-7 flex h-12 items-center justify-center rounded-xl bg-[#173f2c] text-xs font-extrabold text-white"
              >
                Buka magic link mock <ArrowRight className="ml-2 size-4" />
              </Link>
              <button
                onClick={() => setSent(false)}
                className="mt-5 text-[10px] font-extrabold text-[#315d47]"
              >
                Gunakan email lain
              </button>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-extrabold tracking-[.15em] text-[#315d47] uppercase">
                Buyer Portal
              </p>
              <h1 className="font-display mt-4 text-6xl leading-[.9] tracking-[-.04em]">
                Semua pembelianmu, satu tempat.
              </h1>
              <p className="mt-5 text-sm leading-6 text-[#718078]">
                Masukkan email yang digunakan saat checkout. Tidak perlu
                password atau membuat akun baru.
              </p>
              <label className="mt-8 grid gap-2 text-xs font-extrabold">
                Email pembelian
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  className="hairline h-12 rounded-xl border bg-white px-4 text-sm font-normal outline-none focus:ring-4 focus:ring-[#173f2c]/10"
                />
              </label>
              <button
                onClick={submit}
                disabled={loading}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f2c] text-xs font-extrabold text-white disabled:opacity-60"
              >
                {loading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <>
                    Kirim magic link <ArrowRight className="size-4" />
                  </>
                )}
              </button>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-[9px] text-[#7a867f]">
                <ShieldCheck className="size-3.5" /> Kami tidak akan memberi
                tahu apakah email terdaftar.
              </p>
            </>
          )}
        </div>
        <Link
          href="/"
          className="text-center text-[9px] font-bold text-[#7a867f]"
        >
          ← Kembali ke Fersaku
        </Link>
      </section>
      <section className="noise relative hidden overflow-hidden bg-[#173f2c] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-28 -right-24 size-[420px] rounded-full border border-white/10" />
        <div className="my-auto">
          <span className="font-display grid size-16 place-items-center rounded-[22px] bg-[#d7ff64] text-3xl text-[#173f2c]">
            AI
          </span>
          <h2 className="font-display mt-9 max-w-xl text-6xl leading-[.92]">
            Koleksi digital yang selalu bisa kamu temukan kembali.
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {[
              "Download ulang dengan aman",
              "Akses link & credential",
              "Lihat update dari seller",
              "Kelola perangkat aktif",
            ].map((x) => (
              <div
                key={x}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.05] p-4 text-[10px] font-bold"
              >
                <span className="grid size-5 place-items-center rounded-full bg-[#d7ff64] text-[#173f2c]">
                  <Check className="size-3" />
                </span>
                {x}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
