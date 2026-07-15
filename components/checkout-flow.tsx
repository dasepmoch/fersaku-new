"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { mockApi, type Product } from "@/lib/mock-data";
import { rupiah } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Masukkan nama lengkap"),
  email: z.email("Email belum valid"),
});
type Values = z.infer<typeof schema>;
export function CheckoutFlow({ product }: { product: Product }) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "qris" | "paid">("form");
  const [seconds, setSeconds] = useState(892);
  const [paying, setPaying] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (step !== "qris") return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step]);
  const submit = async (v: Values) => {
    await mockApi.createCheckout(v, product.id);
    setStep("qris");
  };
  const simulate = async () => {
    setPaying(true);
    const result = await mockApi.simulatePayment();
    setStep("paid");
    setTimeout(() => router.push(`/orders/${result.orderId}/success`), 900);
  };
  const time = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  if (step === "paid")
    return (
      <div className="py-12 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#d7ff64]">
          <Check className="size-9" />
        </span>
        <h2 className="font-display mt-6 text-5xl">Pembayaran berhasil!</h2>
        <p className="mt-3 text-sm text-[#6e7a73]">
          Menyiapkan produk digitalmu...
        </p>
        <LoaderCircle className="mx-auto mt-6 size-5 animate-spin" />
      </div>
    );
  if (step === "qris")
    return (
      <div className="text-center">
        <p className="text-[10px] font-extrabold tracking-[.15em] text-[#718078] uppercase">
          Scan QRIS untuk membayar
        </p>
        <div className="hairline shadow-card mx-auto mt-5 grid size-56 place-items-center rounded-[28px] border bg-white">
          <div className="relative">
            <QrCode className="size-44 text-[#17231d]" strokeWidth={1.25} />
            <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-[#173f2c] text-xs font-black text-[#d7ff64]">
              F
            </span>
          </div>
        </div>
        <p className="mt-5 text-2xl font-extrabold">{rupiah(product.price)}</p>
        <p className="mt-1 text-xs text-[#6f7b74]">
          QR berlaku selama <b className="text-[#b2573c]">{time}</b>
        </p>
        <div className="mt-6 rounded-2xl bg-[#edf0e9] p-4 text-xs leading-5 text-[#647169]">
          Buka aplikasi pembayaran atau mobile banking, pilih Scan QR, lalu
          arahkan ke kode di atas.
        </div>
        <button
          onClick={simulate}
          disabled={paying}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#173f2c]/15 bg-white text-xs font-extrabold transition hover:bg-[#f2f4ee]"
        >
          {paying ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            "Simulasikan pembayaran berhasil"
          )}
        </button>
        <button
          onClick={() => setStep("form")}
          className="mt-4 text-[11px] font-bold text-[#708078]"
        >
          Ubah data pembeli
        </button>
      </div>
    );
  return (
    <form onSubmit={handleSubmit(submit)}>
      <div className="mb-6">
        <p className="text-[10px] font-extrabold tracking-[.15em] text-[#718078] uppercase">
          Informasi pembeli
        </p>
        <h2 className="font-display mt-2 text-4xl tracking-[-.03em]">
          Hampir jadi milikmu.
        </h2>
      </div>
      <label className="grid gap-2 text-xs font-bold">
        Nama lengkap
        <input
          {...register("name")}
          placeholder="Nama kamu"
          className="ring-focus hairline h-12 rounded-xl border bg-white px-4 text-sm outline-none"
        />
        {errors.name && (
          <span className="text-[10px] text-[#bd543d]">
            {errors.name.message}
          </span>
        )}
      </label>
      <label className="mt-4 grid gap-2 text-xs font-bold">
        Email
        <input
          {...register("email")}
          type="email"
          placeholder="email@kamu.com"
          className="ring-focus hairline h-12 rounded-xl border bg-white px-4 text-sm outline-none"
        />
        {errors.email && (
          <span className="text-[10px] text-[#bd543d]">
            {errors.email.message}
          </span>
        )}
        <span className="leading-4 font-normal text-[#89938d]">
          Produk dan bukti pembayaran dikirim ke email ini.
        </span>
      </label>
      <div className="mt-6 rounded-2xl border-2 border-[#173f2c] bg-[#eff3e9] p-4">
        <div className="flex items-center">
          <span className="grid size-10 place-items-center rounded-xl bg-white">
            <QrCode className="size-5" />
          </span>
          <div className="ml-3">
            <b className="block text-sm">QRIS</b>
            <span className="text-[10px] text-[#6f7b74]">
              Semua e-wallet & mobile banking
            </span>
          </div>
          <span className="ml-auto grid size-5 place-items-center rounded-full border-[5px] border-[#173f2c] bg-white" />
        </div>
      </div>
      <button
        disabled={isSubmitting}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f2c] text-sm font-extrabold text-white transition hover:bg-[#0e3020] disabled:opacity-60"
      >
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <>
            Lanjut ke pembayaran <ArrowRight className="size-4" />
          </>
        )}
      </button>
      <p className="mt-4 flex items-center justify-center gap-1 text-[10px] font-bold text-[#7e8983]">
        <ShieldCheck className="size-3.5" /> Pembayaran terenkripsi dan aman
      </p>
    </form>
  );
}
